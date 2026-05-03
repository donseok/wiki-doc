/**
 * 카드 코멘트 API — FR-606
 *
 * GET  /api/cards/[id]/comments
 * POST /api/cards/[id]/comments  { body }
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, fail, parseJson, handleError } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const items = await prisma.cardComment.findMany({
      where: { cardId: params.id },
      orderBy: { createdAt: 'asc' },
    });
    return ok(items);
  } catch (err) {
    return handleError(err);
  }
}

const CreateSchema = z.object({
  body: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, CreateSchema);
    const author = getCurrentUserServer();

    const card = await prisma.card.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!card) return fail('카드를 찾을 수 없습니다', 404);

    const created = await prisma.cardComment.create({
      data: { cardId: params.id, body: body.body, authorName: author },
    });
    return ok(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
