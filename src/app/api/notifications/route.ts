/**
 * 알림 — FR-901 ~ FR-903
 *
 * GET  /api/notifications?unread=true|false   내 알림 목록
 * POST /api/notifications                      { action: 'readAll' | 'read', ids?: [] }
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';
import { ok, parseJson, handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const me = getCurrentUserServer();
    const u = new URL(req.url);
    const unread = u.searchParams.get('unread');

    const list = await prisma.notification.findMany({
      where: {
        recipient: me,
        ...(unread === 'true' ? { readAt: null } : {}),
        ...(unread === 'false' ? { readAt: { not: null } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const unreadCount = await prisma.notification.count({
      where: { recipient: me, readAt: null },
    });
    return ok({ items: list, unreadCount });
  } catch (err) {
    return handleError(err);
  }
}

const PostSchema = z.object({
  action: z.enum(['readAll', 'read']),
  ids: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, PostSchema);
    const me = getCurrentUserServer();
    const now = new Date();

    if (body.action === 'readAll') {
      const result = await prisma.notification.updateMany({
        where: { recipient: me, readAt: null },
        data: { readAt: now },
      });
      return ok({ markedRead: result.count });
    }
    if (body.action === 'read' && body.ids?.length) {
      const result = await prisma.notification.updateMany({
        where: { id: { in: body.ids }, recipient: me, readAt: null },
        data: { readAt: now },
      });
      return ok({ markedRead: result.count });
    }
    return ok({ markedRead: 0 });
  } catch (err) {
    return handleError(err);
  }
}
