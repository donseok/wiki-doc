/**
 * 화이트보드 요소 단건 — FR-1203
 *
 * PATCH  /api/whiteboards/[id]/elements/[elementId]   부분 업데이트
 * DELETE /api/whiteboards/[id]/elements/[elementId]
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().min(1).optional(),
  height: z.number().min(1).optional(),
  contentJson: z.any().optional(),
  parentFrameId: z.string().nullable().optional(),
  zIndex: z.number().int().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; elementId: string } },
) {
  try {
    const body = await parseJson(req, PatchSchema);
    const updated = await prisma.whiteboardElement.update({
      where: { id: params.elementId },
      data: {
        ...(body.x !== undefined ? { x: body.x } : {}),
        ...(body.y !== undefined ? { y: body.y } : {}),
        ...(body.width !== undefined ? { width: body.width } : {}),
        ...(body.height !== undefined ? { height: body.height } : {}),
        ...(body.contentJson !== undefined ? { contentJson: body.contentJson } : {}),
        ...(body.parentFrameId !== undefined ? { parentFrameId: body.parentFrameId ?? null } : {}),
        ...(body.zIndex !== undefined ? { zIndex: body.zIndex } : {}),
      },
    });
    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; elementId: string } },
) {
  try {
    await prisma.whiteboardElement.delete({ where: { id: params.elementId } });
    return ok({ deletedId: params.elementId });
  } catch (err) {
    return handleError(err);
  }
}
