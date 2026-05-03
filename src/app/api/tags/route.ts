/**
 * 태그 — FR-801 ~ FR-805
 *
 * GET   /api/tags             전체 태그 목록 + 사용 빈도
 * POST  /api/tags             { name, color? } 태그 생성
 * PATCH /api/tags             { id, name?, color?, mergeIntoId? }
 *   - mergeIntoId 지정 시 태그 병합 (FR-805)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tags = await prisma.tag.findMany({
      include: { _count: { select: { pages: true } } },
      orderBy: { name: 'asc' },
    });
    return ok(
      tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        usageCount: t._count.pages,
      })),
    );
  } catch (err) {
    return handleError(err);
  }
}

const CreateSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().max(20).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, CreateSchema);
    const created = await prisma.tag.upsert({
      where: { name: body.name },
      update: { color: body.color },
      create: { name: body.name, color: body.color },
    });
    return ok(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

const PatchSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50).optional(),
  color: z.string().max(20).optional(),
  mergeIntoId: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const body = await parseJson(req, PatchSchema);

    // 태그 병합: source 의 PageTag 들을 target 으로 옮기고 source 삭제
    if (body.mergeIntoId && body.mergeIntoId !== body.id) {
      const result = await prisma.$transaction(async (tx) => {
        const pageTags = await tx.pageTag.findMany({ where: { tagId: body.id } });
        for (const pt of pageTags) {
          await tx.pageTag.upsert({
            where: { pageId_tagId: { pageId: pt.pageId, tagId: body.mergeIntoId! } },
            update: {},
            create: { pageId: pt.pageId, tagId: body.mergeIntoId! },
          });
        }
        await tx.pageTag.deleteMany({ where: { tagId: body.id } });
        await tx.tag.delete({ where: { id: body.id } });
        return tx.tag.findUnique({ where: { id: body.mergeIntoId! } });
      });
      if (!result) return fail('병합 대상 태그를 찾을 수 없습니다', 404);
      return ok(result);
    }

    const updated = await prisma.tag.update({
      where: { id: body.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
      },
    });
    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
