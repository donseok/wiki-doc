/**
 * Decision 단건 — FR-507 / FR-508
 *
 * GET    /api/decisions/[id]?include=logs       단건 조회 (옵션: 상태 변경 이력 포함)
 * PATCH  /api/decisions/[id]                    부분 업데이트 — status 변경 시 DecisionStatusLog 자동 기록
 * DELETE /api/decisions/[id]
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError, fail } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  context: z.string().optional(),
  options: z.any().optional(),
  decision: z.string().optional(),
  rationale: z.string().optional(),
  owner: z.string().nullable().optional(),
  status: z.enum(['Proposed', 'Accepted', 'Rejected', 'Superseded']).optional(),
  decidedAt: z.string().datetime().nullable().optional(),
  statusNote: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const u = new URL(req.url);
    const include = u.searchParams.get('include') || '';
    const wantLogs = include.split(',').includes('logs');

    const decision = await prisma.decision.findUnique({
      where: { id: params.id },
      include: {
        page: { select: { id: true, treeNode: { select: { id: true, title: true } } } },
        ...(wantLogs
          ? { statusLogs: { orderBy: { changedAt: 'desc' } } }
          : {}),
      },
    });
    if (!decision) return fail('Decision 을 찾을 수 없습니다', 404);
    return ok(decision);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, PatchSchema);
    const actor = getCurrentUserServer();

    const cur = await prisma.decision.findUnique({ where: { id: params.id } });
    if (!cur) return fail('Decision 을 찾을 수 없습니다', 404);

    const updated = await prisma.$transaction(async (tx) => {
      // 상태 변경 이력 (FR-508) — 트랜잭션 내에서 원자적으로 기록
      if (body.status && body.status !== cur.status) {
        await tx.decisionStatusLog.create({
          data: {
            decisionId: cur.id,
            fromStatus: cur.status,
            toStatus: body.status,
            changedBy: actor,
            note: body.statusNote,
          },
        });
      }
      return tx.decision.update({
        where: { id: cur.id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.context !== undefined ? { context: body.context } : {}),
          ...(body.options !== undefined ? { options: body.options } : {}),
          ...(body.decision !== undefined ? { decision: body.decision } : {}),
          ...(body.rationale !== undefined ? { rationale: body.rationale } : {}),
          ...(body.owner !== undefined ? { owner: body.owner ?? null } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.decidedAt !== undefined
            ? { decidedAt: body.decidedAt ? new Date(body.decidedAt) : null }
            : {}),
        },
      });
    });

    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.decision.delete({ where: { id: params.id } });
    return ok({ deletedId: params.id });
  } catch (err) {
    return handleError(err);
  }
}
