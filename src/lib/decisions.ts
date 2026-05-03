/**
 * Decision 블록 동기화 — FR-507 / FR-508
 *
 * 페이지 본문의 TipTap JSON 또는 contentJson.html 에서 `decisionBlock` 노드를
 * 추출해 DB Decision 과 동기화한다.
 *
 *  - 신규 노드 (decisionId === null) → DB 생성, 본문 JSON 에 decisionId 주입
 *  - 기존 노드 (decisionId 있음)  → DB 업데이트 (title/status/context/decision/...)
 *  - 본문에서 사라진 Decision  → DB 삭제 (1차 구현, soft delete 미적용)
 *
 * 본 모듈은 페이지 저장 트랜잭션 외부에서 호출되며, 본문 JSON 을 일부
 * 변경(decisionId 주입)할 수 있다. 호출부는 반환된 `mutated === true` 인
 * 경우에만 Page.contentJson 을 다시 갱신해야 한다.
 *
 * blockId 는 노드의 안정 식별자로 사용되며, 본문 내 등장 순서 + title 해시로
 * 결정한다. (decisionId 가 없는 신규 노드도 동일 페이지 내 중복 방지가
 * 가능해야 하므로.)
 */

import { createHash } from 'node:crypto';
import { prisma } from './db';

const DECISION_TYPE = 'decisionBlock';

export interface ParsedDecision {
  /** 노드 식별자 (페이지 내 안정 ID) */
  blockId: string;
  decisionId: string | null;
  title: string;
  status: 'Proposed' | 'Accepted' | 'Rejected' | 'Superseded';
  /** 본문 텍스트(파라그래프 내용 합쳐서 추출) — context/decision/rationale 자동 채움용 */
  bodyText: string;
  /** 본문 JSON 트리에서 노드의 in-place 참조 (decisionId 주입용) */
  ref: { node: TipTapNode };
}

/* -------------------------------------------------- */
/*  TipTap JSON 타입 (간략)                            */
/* -------------------------------------------------- */
export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: unknown[];
}

/* -------------------------------------------------- */
/*  본문 → Decision 노드 추출                          */
/* -------------------------------------------------- */
export function extractDecisionBlocks(doc: TipTapNode | null | undefined): ParsedDecision[] {
  if (!doc) return [];
  const out: ParsedDecision[] = [];
  let counter = 0;
  walk(doc);
  return out;

  function walk(node: TipTapNode): void {
    if (!node || typeof node !== 'object') return;
    if (node.type === DECISION_TYPE) {
      const attrs = (node.attrs ?? {}) as Record<string, unknown>;
      const decisionId = (attrs.decisionId as string | null | undefined) ?? null;
      const title = (attrs.title as string | undefined) ?? '의사결정 제목';
      const status = normalizeStatus(attrs.status);
      const bodyText = collectText(node).trim();
      const blockId = decisionId ?? makeBlockId(counter, title);
      counter += 1;
      out.push({
        blockId,
        decisionId,
        title,
        status,
        bodyText,
        ref: { node },
      });
      // children 도 순회 (중첩 Decision 은 비정상이지만 안전망)
    }
    if (Array.isArray(node.content)) {
      for (const c of node.content) walk(c);
    }
  }
}

function collectText(node: TipTapNode): string {
  if (typeof node.text === 'string') return node.text;
  if (!Array.isArray(node.content)) return '';
  return node.content.map(collectText).join('\n');
}

function makeBlockId(idx: number, title: string): string {
  const h = createHash('sha1').update(`${idx}::${title}`).digest('hex').slice(0, 8);
  return `decision-${idx}-${h}`;
}

function normalizeStatus(v: unknown): ParsedDecision['status'] {
  return v === 'Accepted' || v === 'Rejected' || v === 'Superseded' ? v : 'Proposed';
}

/* -------------------------------------------------- */
/*  contentJson 입출력 정규화                           */
/* -------------------------------------------------- */

/**
 * Page.contentJson 은 다음 두 형태가 가능하다.
 *  (A) TipTap document JSON  — { type:'doc', content:[...] }
 *  (B) HTML 래퍼            — { html: "<...>"} (현재 에디터 저장 포맷)
 *
 * (B) 의 경우는 동기화 대상에서 제외한다 (decisionBlock 노드 식별 불가).
 * 호출부에서 contentJson 이 (A) 형식인지 확인 후 호출.
 */
export function isTipTapDoc(value: unknown): value is TipTapNode {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as TipTapNode).type === 'doc' &&
    Array.isArray((value as TipTapNode).content)
  );
}

/* -------------------------------------------------- */
/*  동기화                                              */
/* -------------------------------------------------- */

export interface SyncResult {
  /** 본문 JSON 이 수정되었는가 (decisionId 주입 등) */
  mutated: boolean;
  /** 갱신/생성/삭제 통계 */
  stats: { created: number; updated: number; deleted: number };
  /** 갱신된 본문 JSON (mutated === true 인 경우만 의미 있음) */
  contentJson: TipTapNode | null;
}

/**
 * 페이지 저장 시 호출.
 *  - parsed: 본문에서 추출한 Decision 노드 목록 (extractDecisionBlocks 결과)
 *  - 존재하지 않는 decisionBlock(타 사용자가 동시에 작업한 경우 등) 도 본문 기준으로 정리.
 *
 * 본문이 (B) HTML 래퍼인 경우 호출하지 말 것.
 */
export async function syncDecisions(
  pageId: string,
  rootDoc: TipTapNode | null,
): Promise<SyncResult> {
  const parsed = extractDecisionBlocks(rootDoc);
  const existing = await prisma.decision.findMany({ where: { pageId } });

  const seenIds = new Set<string>();
  const seenBlockIds = new Set<string>();
  const stats = { created: 0, updated: 0, deleted: 0 };
  let mutated = false;

  for (const p of parsed) {
    if (p.decisionId) {
      // 기존 Decision 갱신
      const cur = existing.find((e) => e.id === p.decisionId);
      if (!cur) {
        // DB 에 없으면(삭제됨/타 페이지) 신규 생성으로 폴백
        await createNew(p);
      } else {
        seenIds.add(cur.id);
        seenBlockIds.add(cur.blockId);
        if (
          cur.title !== p.title ||
          cur.status !== p.status
        ) {
          await prisma.decision.update({
            where: { id: cur.id },
            data: {
              title: p.title,
              status: p.status,
              ...(cur.blockId !== p.blockId ? { blockId: p.blockId } : {}),
            },
          });
          stats.updated += 1;
        }
      }
    } else {
      // 신규 노드 — DB 생성 + 본문 JSON 에 decisionId 주입
      await createNew(p);
    }
  }

  // 본문에서 사라진 Decision 삭제 (다른 사용자 손절 방지를 위해 blockId 도 검사)
  for (const e of existing) {
    if (seenIds.has(e.id) || seenBlockIds.has(e.blockId)) continue;
    await prisma.decision.delete({ where: { id: e.id } });
    stats.deleted += 1;
  }

  return { mutated, stats, contentJson: rootDoc };

  async function createNew(p: ParsedDecision) {
    // blockId 충돌 방지
    let blockId = p.blockId;
    if (seenBlockIds.has(blockId)) {
      blockId = `${blockId}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const created = await prisma.decision.create({
      data: {
        pageId,
        blockId,
        title: p.title,
        status: p.status,
      },
    });
    stats.created += 1;
    seenIds.add(created.id);
    seenBlockIds.add(created.blockId);
    // 본문 JSON 에 decisionId 주입
    const attrs = (p.ref.node.attrs ?? {}) as Record<string, unknown>;
    p.ref.node.attrs = { ...attrs, decisionId: created.id };
    mutated = true;
  }
}
