/**
 * 카드 단건 — FR-602 / FR-603 / FR-604
 *
 * PATCH  /api/cards/[id]   { column?, order?, color?, title?, body? }
 *  - column 변경 = 칸반 드래그(FR-603)
 *  - color 변경 = FR-604
 * DELETE /api/cards/[id]
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(2000).nullable().optional(),
  column: z.string().min(1).max(40).optional(),
  order: z.number().int().optional(),
  color: z.string().max(20).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, PatchSchema);
    const updated = await prisma.card.update({
      where: { id: params.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.column !== undefined ? { column: body.column } : {}),
        ...(body.order !== undefined ? { order: body.order } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
      },
    });
    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.card.delete({ where: { id: params.id } });
    return ok({ deletedId: params.id });
  } catch (err) {
    return handleError(err);
  }
}
