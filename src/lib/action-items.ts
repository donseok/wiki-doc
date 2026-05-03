/**
 * Action Items 추출 / 동기화 — FR-1007
 *
 * 페이지 본문(Markdown)에서 다음 패턴을 추출:
 *   - [ ] @user 내용     (assignee + 미완료)
 *   - [x] @user 내용     (assignee + 완료)
 *   - [ ] 내용           (assignee 없음, 미완료)
 *
 * blockId 는 본문 내 라인 인덱스 기반 안정 ID 로 생성한다 (md-line-N).
 * TipTap JSON 구조에서는 추후 실제 블록 ID 로 교체 가능.
 *
 * TODO 호출 위치:
 *   1) src/app/api/pages/[id]/route.ts PUT (본문 변경 시) → syncActionItems(pageId, contentMarkdown)
 *   2) src/app/api/tree/route.ts POST (페이지 생성 시 템플릿 본문이 있다면) → syncActionItems
 */

import { prisma } from './db';
import { createHash } from 'node:crypto';

export interface ParsedActionItem {
  blockId: string;
  content: string;
  assignee?: string;
  completed: boolean;
}

const TASK_LINE = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/;
const MENTION = /@([\w가-힣.\-_]+)/;

export function parseActionItems(markdown: string): ParsedActionItem[] {
  if (!markdown) return [];
  const out: ParsedActionItem[] = [];
  const lines = markdown.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const m = line.match(TASK_LINE);
    if (!m) return;
    const completed = m[1].toLowerCase() === 'x';
    const text = m[2].trim();
    const mention = text.match(MENTION);
    const blockId = stableBlockId(idx, text);
    out.push({
      blockId,
      content: text,
      assignee: mention?.[1],
      completed,
    });
  });
  return out;
}

function stableBlockId(lineIdx: number, text: string): string {
  const h = createHash('sha1').update(text).digest('hex').slice(0, 8);
  return `ai-${lineIdx}-${h}`;
}

/**
 * 본문 변경 시 호출. 파싱 결과와 DB 상태를 동기화한다.
 *  - 새 라인 → upsert (생성)
 *  - 본문에 더 이상 없는 라인 → 삭제 (단, 사용자가 수동 추가한 항목은 보존)
 */
export async function syncActionItems(pageId: string, markdown: string): Promise<void> {
  const parsed = parseActionItems(markdown);
  const existing = await prisma.actionItem.findMany({ where: { pageId } });
  const parsedMap = new Map(parsed.map((p) => [p.blockId, p]));
  const existMap = new Map(existing.map((e) => [e.blockId, e]));

  const ops: Promise<unknown>[] = [];

  // 추가/갱신
  for (const p of parsed) {
    const e = existMap.get(p.blockId);
    if (!e) {
      ops.push(
        prisma.actionItem.create({
          data: {
            pageId,
            blockId: p.blockId,
            content: p.content,
            assignee: p.assignee,
            completed: p.completed,
            completedAt: p.completed ? new Date() : null,
          },
        }),
      );
    } else if (
      e.content !== p.content ||
      e.assignee !== (p.assignee ?? null) ||
      e.completed !== p.completed
    ) {
      ops.push(
        prisma.actionItem.update({
          where: { id: e.id },
          data: {
            content: p.content,
            assignee: p.assignee,
            completed: p.completed,
            completedAt: p.completed && !e.completed ? new Date() : e.completedAt,
          },
        }),
      );
    }
  }

  // 본문에서 사라진 항목 — blockId 가 ai- 접두사인 자동 추출 항목만 정리.
  for (const e of existing) {
    if (e.blockId.startsWith('ai-') && !parsedMap.has(e.blockId)) {
      ops.push(prisma.actionItem.delete({ where: { id: e.id } }));
    }
  }

  await Promise.all(ops);
}
