/**
 * 검색 API — FR-301 ~ FR-305, FR-1108
 *
 * GET /api/search?q=keyword&space=<treeNodeId>&tag=<tagName>&status=<PageStatus>&sort=<relevance|recent|title>&limit=50
 *
 * 응답: SearchHit[] 배열을 직접 반환 (UI 단순화).
 *      Sprint 2: PostgreSQL FTS(to_tsvector) + pg_trgm similarity 조합으로 한국어 부분 일치 보강.
 */

import { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/api';
import { searchPages, type SearchFilters } from '@/lib/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const q = (u.searchParams.get('q') || '').trim();
    const status = u.searchParams.get('status');
    if (!q && !status) return ok([]);

    const filters: SearchFilters = {
      q,
      space: u.searchParams.get('space'),
      tag: u.searchParams.get('tag'),
      status,
      sort: (u.searchParams.get('sort') as SearchFilters['sort']) || 'relevance',
      limit: Number(u.searchParams.get('limit') || 50),
    };

    const hits = await searchPages(filters);
    return ok(hits);
  } catch (err) {
    return handleError(err);
  }
}
