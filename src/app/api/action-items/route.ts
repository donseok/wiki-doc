/**
 * Action Items — FR-1007
 *
 * GET  /api/action-items?assignee=&completed=&pageId=
 * POST /api/action-items                            (수동 추가, 자동은 lib/action-items.ts)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const assignee = u.searchParams.get('assignee');
    const pageId = u.searchParams.get('pageId');
    const completedRaw = u.searchParams.get('completed');
    const completed =
      completedRaw === 'true' ? true : completedRaw === 'false' ? false : undefined;

    const list = await prisma.actionItem.findMany({
      where: {
        ...(assignee ? { assignee } : {}),
        ...(pageId ? { pageId } : {}),
        ...(completed !== undefined ? { completed } : {}),
      },
      orderBy: [{ completed: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      include: { page: { select: { id: true, treeNode: { select: { id: true, title: true } } } } },
      take: 500,
    });
    return ok(list);
  } catch (err) {
    return handleError(err);
  }
}

const CreateSchema = z.object({
  pageId: z.string(),
  blockId: z.string().min(1).optional(),
  content: z.string().min(1).max(2000),
  assignee: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, CreateSchema);
    const created = await prisma.actionItem.create({
      data: {
        pageId: body.pageId,
        blockId: body.blockId ?? `manual-${Date.now()}`,
        content: body.content,
        assignee: body.assignee,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      },
    });
    return ok(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
