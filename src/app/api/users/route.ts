/**
 * 사용자 목록 — FR-504 멘션(@) 자동완성용
 *
 * GET /api/users?q=keyword&limit=50
 *   - 페이지 작성자 + 코멘트 작성자 + Watch 사용자 + ActionItem 담당자의 distinct 합집합
 *   - 50명 제한, 최근 활동 순 (코멘트/페이지 updatedAt 기준)
 *   - 응답: { name: string, lastSeenAt: string | null }[]
 *
 * Sprint 1 인증 미적용이라 자유 입력 가능. 자동완성 제안용으로만 사용.
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const q = (u.searchParams.get('q') ?? '').trim().toLowerCase();
    const limit = Math.min(Number(u.searchParams.get('limit') ?? 50) || 50, 200);

    // 사용자명 + 마지막 활동시간을 모은다.
    const map = new Map<string, Date>();

    const upsert = (name: string | null | undefined, when: Date | null | undefined) => {
      if (!name) return;
      const trimmed = name.trim();
      if (!trimmed || trimmed === '익명') return;
      const cur = map.get(trimmed);
      const w = when ?? new Date(0);
      if (!cur || cur < w) map.set(trimmed, w);
    };

    const [pages, comments, watches, actions] = await Promise.all([
      prisma.page.findMany({
        select: { authorName: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
      prisma.comment.findMany({
        select: { authorName: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.pageWatch.findMany({
        select: { watcherName: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.actionItem.findMany({
        where: { assignee: { not: null } },
        select: { assignee: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
    ]);

    pages.forEach((p) => upsert(p.authorName, p.updatedAt));
    comments.forEach((c) => upsert(c.authorName, c.createdAt));
    watches.forEach((w) => upsert(w.watcherName, w.createdAt));
    actions.forEach((a) => upsert(a.assignee, a.updatedAt));

    // 시스템 기본 사용자
    ['PM', '리더'].forEach((name) => {
      if (!map.has(name)) map.set(name, new Date(0));
    });

    let entries = Array.from(map.entries()).map(([name, lastSeenAt]) => ({
      name,
      lastSeenAt: lastSeenAt.getTime() === 0 ? null : lastSeenAt.toISOString(),
    }));

    if (q) {
      entries = entries.filter((e) => e.name.toLowerCase().includes(q));
    }

    // 최근 활동 우선 정렬 (lastSeenAt null 은 뒤로)
    entries.sort((a, b) => {
      if (!a.lastSeenAt && !b.lastSeenAt) return a.name.localeCompare(b.name);
      if (!a.lastSeenAt) return 1;
      if (!b.lastSeenAt) return -1;
      return b.lastSeenAt.localeCompare(a.lastSeenAt);
    });

    return ok(entries.slice(0, limit));
  } catch (err) {
    return handleError(err);
  }
}
