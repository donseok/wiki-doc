/**
 * 페이지-태그 연결 — FR-801 ~ FR-805
 *
 * POST   /api/pages/[id]/tags         { name } 태그 추가 (없으면 자동 생성)
 * DELETE /api/pages/[id]/tags?tagId=  태그 제거
 *
 * GET 은 /api/pages/[id] 에서 tags 가 함께 반환되므로 별도 제공하지 않는다.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ok, fail, parseJson, handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AddTagSchema = z.object({
  /** 태그 이름. 없으면 자동 생성. */
  name: z.string().min(1).max(50),
  color: z.string().max(20).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, AddTagSchema);
    const name = body.name.trim();
    if (!name) return fail('태그 이름이 필요합니다', 400);

    const page = await prisma.page.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!page) return fail('페이지를 찾을 수 없습니다', 404);

    const result = await prisma.$transaction(async (tx) => {
      const tag = await tx.tag.upsert({
        where: { name },
        update: { ...(body.color !== undefined ? { color: body.color } : {}) },
        create: { name, color: body.color },
      });
      try {
        await tx.pageTag.create({
          data: { pageId: params.id, tagId: tag.id },
        });
      } catch (e) {
        // 이미 연결되어 있으면 무시 (P2002: unique constraint)
        if (
          !(e instanceof Prisma.PrismaClientKnownRequestError) ||
          e.code !== 'P2002'
        ) {
          throw e;
        }
      }
      return tag;
    });

    return ok(result, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const u = new URL(req.url);
    const tagId = u.searchParams.get('tagId');
    if (!tagId) return fail('tagId 쿼리 파라미터가 필요합니다', 400);

    await prisma.pageTag
      .delete({
        where: { pageId_tagId: { pageId: params.id, tagId } },
      })
      .catch((e) => {
        // 존재하지 않는 연결이면 조용히 무시
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2025'
        ) {
          return;
        }
        throw e;
      });

    return ok({ removed: true });
  } catch (err) {
    return handleError(err);
  }
}
