/**
 * 대시보드 활동 피드 — FR-1006
 *
 * GET /api/dashboard/activity?limit=30
 *  - 최근 페이지 작성/수정, 페이지 상태 변경, Decision 상태 변경,
 *    코멘트, ActionItem 완료 이벤트를 시간순으로 합성하여 반환.
 *
 * 응답:
 * {
 *   items: ActivityItem[],
 *   limit: number,
 *   currentUser: string,
 * }
 *
 * ActivityItem.kind:
 *   - page_updated      : 페이지 본문 변경 (Page.updatedAt)
 *   - page_status       : PageStatusLog
 *   - comment           : Comment 신규
 *   - decision_status   : DecisionStatusLog
 *   - action_done       : ActionItem 완료 (completed=true, completedAt 존재)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleError, ok } from '@/lib/api';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

interface BaseEvent {
  id: string;
  when: string; // ISO
  actor: string | null;
  pageId?: string | null;
  pageTitle?: string | null;
}

type ActivityItem =
  | (BaseEvent & { kind: 'page_updated'; status: string })
  | (BaseEvent & {
      kind: 'page_status';
      fromStatus: string | null;
      toStatus: string;
    })
  | (BaseEvent & { kind: 'comment'; snippet: string })
  | (BaseEvent & {
      kind: 'decision_status';
      decisionId: string;
      decisionTitle: string;
      fromStatus: string | null;
      toStatus: string;
    })
  | (BaseEvent & { kind: 'action_done'; content: string });

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const { limit } = querySchema.parse({
      limit: u.searchParams.get('limit') ?? undefined,
    });
    const me = getCurrentUserServer();

    // 각 소스에서 limit 만큼 가져와 머지 후 limit 으로 잘라낸다 (대용량 시에도 충분)
    const fetchLimit = Math.max(limit, 30);

    const [pageUpdates, pageStatusLogs, commentRows, decisionLogs, actionDoneRows] =
      await Promise.all([
        prisma.page.findMany({
          take: fetchLimit,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            status: true,
            authorName: true,
            updatedAt: true,
            treeNode: { select: { title: true } },
          },
        }),
        prisma.pageStatusLog.findMany({
          take: fetchLimit,
          orderBy: { changedAt: 'desc' },
          select: {
            id: true,
            pageId: true,
            fromStatus: true,
            toStatus: true,
            changedBy: true,
            changedAt: true,
            page: { select: { treeNode: { select: { title: true } } } },
          },
        }),
        prisma.comment.findMany({
          take: fetchLimit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            pageId: true,
            authorName: true,
            body: true,
            createdAt: true,
            page: { select: { treeNode: { select: { title: true } } } },
          },
        }),
        prisma.decisionStatusLog.findMany({
          take: fetchLimit,
          orderBy: { changedAt: 'desc' },
          select: {
            id: true,
            decisionId: true,
            fromStatus: true,
            toStatus: true,
            changedBy: true,
            changedAt: true,
            decision: {
              select: {
                title: true,
                pageId: true,
                page: { select: { treeNode: { select: { title: true } } } },
              },
            },
          },
        }),
        prisma.actionItem.findMany({
          where: { completed: true, completedAt: { not: null } },
          take: fetchLimit,
          orderBy: { completedAt: 'desc' },
          select: {
            id: true,
            pageId: true,
            content: true,
            assignee: true,
            completedAt: true,
            page: { select: { treeNode: { select: { title: true } } } },
          },
        }),
      ]);

    const items: ActivityItem[] = [
      ...pageUpdates.map<ActivityItem>((p) => ({
        kind: 'page_updated',
        id: `pu_${p.id}_${p.updatedAt.toISOString()}`,
        when: p.updatedAt.toISOString(),
        actor: p.authorName,
        pageId: p.id,
        pageTitle: p.treeNode.title,
        status: p.status,
      })),
      ...pageStatusLogs.map<ActivityItem>((s) => ({
        kind: 'page_status',
        id: `ps_${s.id}`,
        when: s.changedAt.toISOString(),
        actor: s.changedBy,
        pageId: s.pageId,
        pageTitle: s.page?.treeNode.title ?? null,
        fromStatus: s.fromStatus ?? null,
        toStatus: s.toStatus,
      })),
      ...commentRows.map<ActivityItem>((c) => ({
        kind: 'comment',
        id: `cm_${c.id}`,
        when: c.createdAt.toISOString(),
        actor: c.authorName,
        pageId: c.pageId,
        pageTitle: c.page?.treeNode.title ?? null,
        snippet: c.body.length > 120 ? `${c.body.slice(0, 120)}…` : c.body,
      })),
      ...decisionLogs.map<ActivityItem>((d) => ({
        kind: 'decision_status',
        id: `ds_${d.id}`,
        when: d.changedAt.toISOString(),
        actor: d.changedBy,
        pageId: d.decision.pageId,
        pageTitle: d.decision.page?.treeNode.title ?? null,
        decisionId: d.decisionId,
        decisionTitle: d.decision.title,
        fromStatus: d.fromStatus ?? null,
        toStatus: d.toStatus,
      })),
      ...actionDoneRows
        .filter((a) => a.completedAt !== null)
        .map<ActivityItem>((a) => ({
          kind: 'action_done',
          id: `ad_${a.id}`,
          when: (a.completedAt as Date).toISOString(),
          actor: a.assignee,
          pageId: a.pageId,
          pageTitle: a.page?.treeNode.title ?? null,
          content: a.content.length > 120 ? `${a.content.slice(0, 120)}…` : a.content,
        })),
    ];

    items.sort((a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0));
    const sliced = items.slice(0, limit);

    return ok({ items: sliced, limit, currentUser: me });
  } catch (err) {
    return handleError(err);
  }
}
