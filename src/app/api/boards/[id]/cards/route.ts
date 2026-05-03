/**
 * 보드 카드 목록/생성 — FR-602 / FR-604 / FR-607
 *
 * GET  /api/boards/[id]/cards?column=&tag=&author=
 * POST /api/boards/[id]/cards   { title, body?, column, color? }
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';
import { ok, parseJson, handleError, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const u = new URL(req.url);
    const column = u.searchParams.get('column');
    const author = u.searchParams.get('author');
    const board = await prisma.board.findUnique({ where: { id: params.id } });
    if (!board) return fail('보드를 찾을 수 없습니다', 404);

    const cards = await prisma.card.findMany({
      where: {
        boardId: params.id,
        ...(column ? { column } : {}),
        ...(author ? { authorName: author } : {}),
      },
      orderBy: [{ column: 'asc' }, { order: 'asc' }],
      include: { _count: { select: { comments: true } } },
    });
    return ok(cards);
  } catch (err) {
    return handleError(err);
  }
}

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  column: z.string().min(1).max(40).default('Idea'),
  color: z.string().max(20).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, CreateSchema);
    const board = await prisma.board.findUnique({ where: { id: params.id } });
    if (!board) return fail('보드를 찾을 수 없습니다', 404);

    const column = body.column ?? 'Idea';
    const maxOrder = await prisma.card.aggregate({
      where: { boardId: params.id, column },
      _max: { order: true },
    });
    const created = await prisma.card.create({
      data: {
        boardId: params.id,
        title: body.title,
        body: body.body,
        column,
        color: body.color,
        order: (maxOrder._max.order ?? -1) + 1,
        authorName: getCurrentUserServer(),
      },
    });
    return ok(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
