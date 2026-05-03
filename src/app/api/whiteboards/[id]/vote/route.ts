/**
 * 화이트보드 투표 — FR-1208
 *
 * POST   /api/whiteboards/[id]/vote   { elementId }   투표 추가
 * DELETE /api/whiteboards/[id]/vote?elementId=...     투표 취소
 *
 * 동일 사용자 중복 투표는 unique 제약으로 차단(스키마 @@unique([elementId, voterName])).
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';
import { ok, parseJson, handleError, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VoteSchema = z.object({ elementId: z.string() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, VoteSchema);
    const me = getCurrentUserServer();

    const el = await prisma.whiteboardElement.findUnique({
      where: { id: body.elementId },
      select: { id: true, whiteboardId: true },
    });
    if (!el || el.whiteboardId !== params.id) {
      return fail('요소를 찾을 수 없습니다', 404);
    }

    // upsert 효과
    const vote = await prisma.whiteboardVote.upsert({
      where: { elementId_voterName: { elementId: body.elementId, voterName: me } },
      update: {},
      create: { elementId: body.elementId, voterName: me },
    });
    const total = await prisma.whiteboardVote.count({ where: { elementId: body.elementId } });
    return ok({ vote, total }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, { params: _params }: { params: { id: string } }) {
  try {
    const u = new URL(req.url);
    const elementId = u.searchParams.get('elementId');
    if (!elementId) return fail('elementId 가 필요합니다', 400);
    const me = getCurrentUserServer();
    await prisma.whiteboardVote.deleteMany({ where: { elementId, voterName: me } });
    const total = await prisma.whiteboardVote.count({ where: { elementId } });
    return ok({ removed: true, total });
  } catch (err) {
    return handleError(err);
  }
}
