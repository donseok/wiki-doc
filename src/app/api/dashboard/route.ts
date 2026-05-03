/**
 * 대시보드 위젯 — FR-1001 ~ FR-1008
 *
 * GET /api/dashboard
 *  - recent       : 최근 변경 페이지 10건 (FR-1002)
 *  - mine         : 내가 작성/수정한 페이지 (FR-1003)
 *  - pending      : Pending 상태 페이지 + Pending 칸반 카드 (FR-1004)
 *  - stats        : 총 페이지수, 상태별 분포, 최근 7일 활동량 (FR-1005)
 *  - activity     : 최근 활동 피드(페이지 변경/코멘트/상태 변경) (FR-1006)
 *  - myActionItems: 내 미완료 Action Items (FR-1007)
 *  - decisions    : Decision 상태별 집계 (FR-1008)
 */

import { handleError, ok } from '@/lib/api';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    const me = getCurrentUserServer();
    const since7d = new Date(Date.now() - SEVEN_DAYS);

    const [
      recent,
      mine,
      pendingPages,
      pendingCards,
      total,
      byStatus,
      activeWeek,
      myActionItems,
      decisionsByStatus,
      recentComments,
      recentStatusLogs,
    ] = await Promise.all([
      prisma.page.findMany({
        take: 10,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          authorName: true,
          treeNode: { select: { id: true, title: true } },
        },
      }),
      prisma.page.findMany({
        where: { authorName: me },
        take: 10,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          treeNode: { select: { id: true, title: true } },
        },
      }),
      prisma.page.findMany({
        where: { status: 'Pending' },
        take: 50,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          pendingReason: true,
          updatedAt: true,
          treeNode: { select: { id: true, title: true } },
        },
      }),
      prisma.card.findMany({
        where: { column: 'Pending' },
        take: 50,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, color: true, updatedAt: true, boardId: true },
      }),
      prisma.page.count(),
      prisma.page.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.page.count({ where: { updatedAt: { gte: since7d } } }),
      prisma.actionItem.findMany({
        where: { assignee: me, completed: false },
        take: 30,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        include: { page: { select: { id: true, treeNode: { select: { title: true } } } } },
      }),
      prisma.decision.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.comment.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          pageId: true,
          authorName: true,
          createdAt: true,
          body: true,
        },
      }),
      prisma.pageStatusLog.findMany({
        take: 10,
        orderBy: { changedAt: 'desc' },
        select: {
          id: true,
          pageId: true,
          fromStatus: true,
          toStatus: true,
          changedBy: true,
          changedAt: true,
        },
      }),
    ]);

    const stats = {
      totalPages: total,
      byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
      activeLast7Days: activeWeek,
    };

    const activity = [
      ...recent.map((p) => ({
        kind: 'page_updated' as const,
        when: p.updatedAt,
        actor: p.authorName,
        pageId: p.id,
        title: p.treeNode.title,
      })),
      ...recentComments.map((c) => ({
        kind: 'comment' as const,
        when: c.createdAt,
        actor: c.authorName,
        pageId: c.pageId,
        snippet: c.body.slice(0, 100),
      })),
      ...recentStatusLogs.map((s) => ({
        kind: 'status_change' as const,
        when: s.changedAt,
        actor: s.changedBy,
        pageId: s.pageId,
        from: s.fromStatus,
        to: s.toStatus,
      })),
    ]
      .sort((a, b) => +new Date(b.when) - +new Date(a.when))
      .slice(0, 20);

    return ok({
      currentUser: me,
      recent,
      mine,
      pending: { pages: pendingPages, cards: pendingCards },
      stats,
      activity,
      myActionItems,
      decisionsByStatus: Object.fromEntries(
        decisionsByStatus.map((g) => [g.status, g._count._all]),
      ),
    });
  } catch (err) {
    return handleError(err);
  }
}
