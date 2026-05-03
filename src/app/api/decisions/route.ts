/**
 * Decision 블록 — FR-507 / FR-508 / FR-1008
 *
 * GET  /api/decisions?status=&owner=&pageId=&fromDate=&toDate=    집계/위젯용
 * POST /api/decisions                            생성 (블록 신규 추가 시)
 *
 * 본문 내 블록과의 동기화:
 *   - blockId 는 페이지 본문(TipTap JSON) 내 블록의 안정적 식별자.
 *     1차 구현: 클라이언트가 blockId 를 함께 전송.
 *   - 페이지 저장 시 자동 동기화: src/lib/decisions.ts → syncDecisions()
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError, fail } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_VALUES = ['Proposed', 'Accepted', 'Rejected', 'Superseded'] as const;
type StatusValue = (typeof STATUS_VALUES)[number];

function isStatus(v: string | null): v is StatusValue {
  return v != null && (STATUS_VALUES as readonly string[]).includes(v);
}

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const statusParam = u.searchParams.get('status');
    const owner = u.searchParams.get('owner');
    const pageId = u.searchParams.get('pageId');
    const fromDate = u.searchParams.get('fromDate');
    const toDate = u.searchParams.get('toDate');
    const dateField = (u.searchParams.get('dateField') || 'updatedAt') as
      | 'updatedAt'
      | 'createdAt'
      | 'decidedAt';

    const where: Prisma.DecisionWhereInput = {
      ...(isStatus(statusParam) ? { status: statusParam } : {}),
      ...(owner ? { owner } : {}),
      ...(pageId ? { pageId } : {}),
    };

    if (fromDate || toDate) {
      const range: Prisma.DateTimeFilter = {};
      if (fromDate) {
        const d = new Date(fromDate);
        if (!Number.isNaN(d.getTime())) range.gte = d;
      }
      if (toDate) {
        const d = new Date(toDate);
        if (!Number.isNaN(d.getTime())) range.lte = d;
      }
      if (Object.keys(range).length > 0) {
        if (dateField === 'createdAt') where.createdAt = range;
        else if (dateField === 'decidedAt') where.decidedAt = range;
        else where.updatedAt = range;
      }
    }

    const list = await prisma.decision.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        page: { select: { id: true, treeNode: { select: { id: true, title: true } } } },
      },
    });
    return ok(list);
  } catch (err) {
    return handleError(err);
  }
}

const CreateSchema = z.object({
  pageId: z.string(),
  blockId: z.string().min(1),
  title: z.string().min(1).max(200),
  context: z.string().optional(),
  options: z.any().optional(),
  decision: z.string().optional(),
  rationale: z.string().optional(),
  owner: z.string().optional(),
  status: z.enum(STATUS_VALUES).default('Proposed'),
  decidedAt: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, CreateSchema);
    const _author = getCurrentUserServer();

    const page = await prisma.page.findUnique({ where: { id: body.pageId }, select: { id: true } });
    if (!page) return fail('페이지를 찾을 수 없습니다', 404);

    const created = await prisma.decision.create({
      data: {
        pageId: body.pageId,
        blockId: body.blockId,
        title: body.title,
        context: body.context,
        options: body.options ?? null,
        decision: body.decision,
        rationale: body.rationale,
        owner: body.owner,
        status: body.status,
        decidedAt: body.decidedAt ? new Date(body.decidedAt) : null,
      },
    });
    return ok(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
