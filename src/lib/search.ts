/**
 * 검색 헬퍼 — FR-301~305, FR-1108
 *
 * 강화 구현 (Sprint 2):
 *  - PostgreSQL `to_tsvector('simple', ...)` 기반 FTS
 *  - `pg_trgm` similarity 로 한국어/오탈자 부분 일치 보강 (pg_bigm 미설치 환경 fallback)
 *  - ILIKE 보조 매칭으로 태그/첨부 파일명 동시 검색
 *  - ts_rank + similarity 조합 점수로 정렬 (recent 보너스)
 *
 * pg_bigm 도입 시: docker/postgres 커스텀 Dockerfile 로 빌드 후, 본 함수의 to_tsvector 부분을
 *                  pg_bigm 의 like_query 또는 GIN 인덱스로 교체. 현 구현으로도 한국어 검색 가능.
 */

import { prisma } from './db';
import type { PageStatus } from '@prisma/client';

export interface SearchFilters {
  q: string;
  space?: string | null;     // 트리 최상위 노드 ID (스페이스)
  tag?: string | null;       // 태그 이름
  status?: string | null;    // PageStatus
  sort?: 'relevance' | 'recent' | 'title';
  limit?: number;
}

export interface SearchHit {
  /** Page.id (라우팅용) */
  id: string;
  pageId: string;
  treeNodeId: string;
  title: string;
  status: PageStatus;
  authorName: string;
  updatedAt: Date;
  snippet: string;
  score: number;
  matchType: 'title' | 'body' | 'tag' | 'attachment';
  matchedAttachments?: { id: string; filename: string }[];
}

const SNIPPET_LEN = 220;

/** 본문 검색어 주변 컨텍스트 추출 */
export function buildSnippet(content: string, q: string): string {
  if (!content) return '';
  const lower = content.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return content.slice(0, SNIPPET_LEN);
  const start = Math.max(0, idx - 80);
  const end = Math.min(content.length, idx + q.length + 140);
  return (
    (start > 0 ? '... ' : '') + content.slice(start, end) + (end < content.length ? ' ...' : '')
  );
}

interface RawRow {
  id: string;
  tree_node_id: string;
  title: string;
  status: PageStatus;
  author_name: string;
  updated_at: Date;
  content_markdown: string;
  fts_rank: number;
  trgm_score: number;
  match_type: 'title' | 'body' | 'tag' | 'attachment';
}

/**
 * 페이지 검색 (FTS + trigram + ILIKE 통합).
 *
 * @returns 점수 높은 순 정렬된 SearchHit 배열
 */
export async function searchPages(filters: SearchFilters): Promise<SearchHit[]> {
  const q = filters.q.trim();
  if (!q) return [];
  const limit = Math.min(filters.limit ?? 50, 200);

  // 트리 최상위 스페이스 필터 → 페이지 ID 화이트리스트
  let spacePageIds: string[] | null = null;
  if (filters.space) {
    spacePageIds = await collectPageIdsInSpace(filters.space);
    if (spacePageIds.length === 0) return [];
  }

  // tsquery 안전 처리 — FTS의 plainto_tsquery 가 사용자 입력을 안전하게 토큰화함
  // similarity 임계값: 0.15 (한국어 짧은 단어에서 흔한 매칭 빈도 고려)
  // ILIKE 패턴: 양 끝에 % 부착
  const ilike = `%${q}%`;
  const SIM_THRESHOLD = 0.15;

  // 단일 raw SQL 로 FTS + similarity + 보조 ILIKE 까지 한 번에. parameterized binding 으로 SQLi 방지.
  // 매치 타입 우선순위: title > body > tag > attachment
  const rows = await prisma.$queryRaw<RawRow[]>`
    WITH page_data AS (
      SELECT
        p.id,
        p."treeNodeId" AS tree_node_id,
        t.title,
        p.status,
        p."authorName" AS author_name,
        p."updatedAt" AS updated_at,
        p."contentMarkdown" AS content_markdown,
        ts_rank(
          to_tsvector('simple', coalesce(t.title, '') || ' ' || coalesce(p."contentMarkdown", '')),
          plainto_tsquery('simple', ${q})
        ) AS fts_rank,
        GREATEST(
          similarity(coalesce(t.title, ''), ${q}),
          similarity(left(coalesce(p."contentMarkdown", ''), 2000), ${q})
        ) AS trgm_score,
        CASE
          WHEN t.title ILIKE ${ilike} THEN 'title'::text
          WHEN p."contentMarkdown" ILIKE ${ilike} THEN 'body'::text
          WHEN EXISTS (
            SELECT 1 FROM "PageTag" pt
            JOIN "Tag" tg ON tg.id = pt."tagId"
            WHERE pt."pageId" = p.id AND tg.name ILIKE ${ilike}
          ) THEN 'tag'::text
          WHEN EXISTS (
            SELECT 1 FROM "Attachment" a
            WHERE a."pageId" = p.id AND a.filename ILIKE ${ilike}
          ) THEN 'attachment'::text
          ELSE 'body'::text
        END AS match_type
      FROM "Page" p
      JOIN "TreeNode" t ON t.id = p."treeNodeId"
      WHERE
        (
          to_tsvector('simple', coalesce(t.title, '') || ' ' || coalesce(p."contentMarkdown", ''))
            @@ plainto_tsquery('simple', ${q})
          OR similarity(coalesce(t.title, ''), ${q}) > ${SIM_THRESHOLD}
          OR similarity(left(coalesce(p."contentMarkdown", ''), 2000), ${q}) > ${SIM_THRESHOLD}
          OR t.title ILIKE ${ilike}
          OR p."contentMarkdown" ILIKE ${ilike}
          OR EXISTS (
            SELECT 1 FROM "PageTag" pt
            JOIN "Tag" tg ON tg.id = pt."tagId"
            WHERE pt."pageId" = p.id AND tg.name ILIKE ${ilike}
          )
          OR EXISTS (
            SELECT 1 FROM "Attachment" a
            WHERE a."pageId" = p.id AND a.filename ILIKE ${ilike}
          )
        )
        ${filters.status ? prismaStatusFilter(filters.status) : prismaNoOp()}
        ${filters.tag ? prismaTagFilter(filters.tag) : prismaNoOp()}
        ${spacePageIds ? prismaIdInFilter(spacePageIds) : prismaNoOp()}
    )
    SELECT *
    FROM page_data
    ORDER BY
      ${sortClause(filters.sort)}
    LIMIT ${limit};
  `;

  // 첨부 매치 페이지에 대해서만 매칭된 첨부 파일명을 추가 조회
  const attachmentMatchPageIds = rows
    .filter((r) => r.match_type === 'attachment')
    .map((r) => r.id);

  const attachmentMap = new Map<string, { id: string; filename: string }[]>();
  if (attachmentMatchPageIds.length > 0) {
    const atts = await prisma.attachment.findMany({
      where: {
        pageId: { in: attachmentMatchPageIds },
        filename: { contains: q, mode: 'insensitive' },
      },
      select: { id: true, filename: true, pageId: true },
      take: attachmentMatchPageIds.length * 5,
    });
    for (const a of atts) {
      if (!a.pageId) continue;
      const list = attachmentMap.get(a.pageId) ?? [];
      list.push({ id: a.id, filename: a.filename });
      attachmentMap.set(a.pageId, list);
    }
  }

  return rows.map<SearchHit>((r) => ({
    id: r.id,
    pageId: r.id,
    treeNodeId: r.tree_node_id,
    title: r.title,
    status: r.status,
    authorName: r.author_name,
    updatedAt: r.updated_at,
    snippet: buildSnippet(r.content_markdown, q),
    score: Number(r.fts_rank) + Number(r.trgm_score),
    matchType: r.match_type,
    matchedAttachments: attachmentMap.get(r.id),
  }));
}

/** 별칭 — 기존 호출자 호환 */
export const searchPagesWithSimilarity = searchPages;

/* ------------------------------------------------------------------ */
/* 헬퍼: SQL fragment 빌더                                              */
/* ------------------------------------------------------------------ */
import { Prisma } from '@prisma/client';

function prismaStatusFilter(status: string) {
  return Prisma.sql`AND p.status = ${status}::"PageStatus"`;
}
function prismaTagFilter(tagName: string) {
  return Prisma.sql`AND EXISTS (
    SELECT 1 FROM "PageTag" pt
    JOIN "Tag" tg ON tg.id = pt."tagId"
    WHERE pt."pageId" = p.id AND tg.name = ${tagName}
  )`;
}
function prismaIdInFilter(ids: string[]) {
  return Prisma.sql`AND p.id IN (${Prisma.join(ids)})`;
}
function prismaNoOp() {
  return Prisma.sql``;
}
function sortClause(sort?: SearchFilters['sort']) {
  switch (sort) {
    case 'recent':
      return Prisma.sql`updated_at DESC`;
    case 'title':
      return Prisma.sql`title ASC`;
    case 'relevance':
    default:
      return Prisma.sql`fts_rank DESC, trgm_score DESC, updated_at DESC`;
  }
}

/* ------------------------------------------------------------------ */
/* 트리 스페이스 → 페이지 ID 수집                                        */
/* ------------------------------------------------------------------ */
async function collectPageIdsInSpace(spaceTreeNodeId: string): Promise<string[]> {
  const allNodes = await prisma.treeNode.findMany({
    select: { id: true, parentId: true, page: { select: { id: true } } },
  });
  const childMap = new Map<string | null, { id: string; page: { id: string } | null }[]>();
  for (const n of allNodes) {
    const list = childMap.get(n.parentId) ?? [];
    list.push(n);
    childMap.set(n.parentId, list);
  }
  const result: string[] = [];
  const queue: string[] = [spaceTreeNodeId];
  while (queue.length) {
    const cur = queue.shift()!;
    const node = allNodes.find((n) => n.id === cur);
    if (node?.page?.id) result.push(node.page.id);
    for (const c of childMap.get(cur) ?? []) queue.push(c.id);
  }
  return result;
}
