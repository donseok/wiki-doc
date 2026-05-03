/**
 * 화이트보드 요소 추가 — FR-1202 ~ FR-1207
 *
 * POST /api/whiteboards/[id]/elements
 *   { type, x, y, width, height, contentJson?, parentFrameId?, zIndex? }
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  type: z.enum(['sticky', 'text', 'shape', 'arrow', 'sticker', 'frame']),
  x: z.number(),
  y: z.number(),
  width: z.number().min(1),
  height: z.number().min(1),
  contentJson: z.any().optional(),
  parentFrameId: z.string().nullable().optional(),
  zIndex: z.number().int().default(0),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, CreateSchema);
    const wb = await prisma.whiteboard.findUnique({ where: { id: params.id } });
    if (!wb) return fail('화이트보드를 찾을 수 없습니다', 404);

    const created = await prisma.whiteboardElement.create({
      data: {
        whiteboardId: params.id,
        type: body.type,
        x: body.x,
        y: body.y,
        width: body.width,
        height: body.height,
        contentJson: body.contentJson ?? null,
        parentFrameId: body.parentFrameId ?? null,
        zIndex: body.zIndex,
      },
    });
    return ok(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
