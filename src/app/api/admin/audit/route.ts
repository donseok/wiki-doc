/**
 * 감사 로그 조회 — NFR-304
 *
 * GET /api/admin/audit?entity=&action=&actor=&limit=100&offset=0
 *   - 최신순. 기본 limit=100, max=500.
 */

import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ok, handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // TODO(NFR-303): admin role check
    const u = new URL(req.url);
    const entity = u.searchParams.get('entity')?.trim() || undefined;
    const action = u.searchParams.get('action')?.trim() || undefined;
    const actor = u.searchParams.get('actor')?.trim() || undefined;
    const limitRaw = Number(u.searchParams.get('limit') ?? '100');
    const offsetRaw = Number(u.searchParams.get('offset') ?? '0');
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const where: Prisma.AuditLogWhereInput = {};
    if (entity) where.entity = entity;
    if (action) where.action = action;
    if (actor) where.actor = { contains: actor, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return ok({
      items,
      total,
      limit,
      offset,
    });
  } catch (err) {
    return handleError(err);
  }
}
