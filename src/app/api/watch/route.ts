/**
 * Watch (페이지 구독) — FR-905 / FR-906
 *
 * GET    /api/watch                    내 구독 목록
 * POST   /api/watch                    구독 추가  { pageId? | treeNodeId?, includeChildren? }
 * DELETE /api/watch?pageId=...
 *        /api/watch?treeNodeId=...     해제
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';
import { ok, parseJson, handleError, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const me = getCurrentUserServer();
    const list = await prisma.pageWatch.findMany({
      where: { watcherName: me },
      include: {
        page: { select: { id: true, treeNode: { select: { id: true, title: true } } } },
        treeNode: { select: { id: true, title: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return ok(list);
  } catch (err) {
    return handleError(err);
  }
}

const PostSchema = z
  .object({
    pageId: z.string().optional(),
    treeNodeId: z.string().optional(),
    includeChildren: z.boolean().default(false),
  })
  .refine((v) => !!(v.pageId || v.treeNodeId), { message: 'pageId 또는 treeNodeId 가 필요합니다' });

export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, PostSchema);
    const me = getCurrentUserServer();

    // unique 제약을 활용해 upsert 효과를 낸다.
    if (body.pageId) {
      const w = await prisma.pageWatch.upsert({
        where: { watcherName_pageId: { watcherName: me, pageId: body.pageId } },
        update: { includeChildren: body.includeChildren },
        create: { watcherName: me, pageId: body.pageId, includeChildren: body.includeChildren },
      });
      return ok(w, { status: 201 });
    }
    if (body.treeNodeId) {
      const w = await prisma.pageWatch.upsert({
        where: { watcherName_treeNodeId: { watcherName: me, treeNodeId: body.treeNodeId } },
        update: { includeChildren: body.includeChildren },
        create: { watcherName: me, treeNodeId: body.treeNodeId, includeChildren: body.includeChildren },
      });
      return ok(w, { status: 201 });
    }
    return fail('pageId 또는 treeNodeId 가 필요합니다', 400);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const me = getCurrentUserServer();
    const u = new URL(req.url);
    const pageId = u.searchParams.get('pageId');
    const treeNodeId = u.searchParams.get('treeNodeId');
    if (!pageId && !treeNodeId) return fail('pageId 또는 treeNodeId 가 필요합니다', 400);

    if (pageId) {
      await prisma.pageWatch.deleteMany({ where: { watcherName: me, pageId } });
    } else if (treeNodeId) {
      await prisma.pageWatch.deleteMany({ where: { watcherName: me, treeNodeId } });
    }
    return ok({ unwatched: true });
  } catch (err) {
    return handleError(err);
  }
}
