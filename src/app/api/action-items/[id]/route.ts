/**
 * Action Item 단건 — FR-1007
 *
 * PATCH /api/action-items/[id]   { completed?, content?, assignee?, dueDate? }
 * DELETE /api/action-items/[id]
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  completed: z.boolean().optional(),
  content: z.string().min(1).max(2000).optional(),
  assignee: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, PatchSchema);
    const updated = await prisma.actionItem.update({
      where: { id: params.id },
      data: {
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.assignee !== undefined ? { assignee: body.assignee ?? null } : {}),
        ...(body.dueDate !== undefined
          ? { dueDate: body.dueDate ? new Date(body.dueDate) : null }
          : {}),
        ...(body.completed !== undefined
          ? {
              completed: body.completed,
              completedAt: body.completed ? new Date() : null,
            }
          : {}),
      },
    });
    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.actionItem.delete({ where: { id: params.id } });
    return ok({ deletedId: params.id });
  } catch (err) {
    return handleError(err);
  }
}
