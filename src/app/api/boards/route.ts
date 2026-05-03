/**
 * 아이디어 보드 — FR-601 / FR-608
 *
 * GET  /api/boards
 * POST /api/boards   { name, description? }
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const list = await prisma.board.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { cards: true } } },
    });
    return ok(list);
  } catch (err) {
    return handleError(err);
  }
}

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, CreateSchema);
    const created = await prisma.board.create({ data: body });
    return ok(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
