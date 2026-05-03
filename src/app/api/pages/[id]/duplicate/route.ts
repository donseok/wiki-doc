/**
 * 페이지 복제 — FR-209
 *
 * POST /api/pages/[id]/duplicate   { parentId?, title? }
 *  - 기존 페이지의 본문/contentJson 을 그대로 복사한 새 페이지 생성.
 *  - 태그도 함께 복사.
 *  - 신규 페이지 상태는 항상 'Draft' 로 시작 (검토 흐름 새로 진행).
 *  - parentId 미지정 시 원본과 동일한 부모 트리 위치에 생성.
 *  - title 미지정 시 "{원제} (복사본)" 자동 생성.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError, fail } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  parentId: z.string().nullable().optional(),
  title: z.string().min(1).max(200).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, Schema);
    const author = getCurrentUserServer();

    const source = await prisma.page.findUnique({
      where: { id: params.id },
      include: {
        treeNode: true,
        tags: { select: { tagId: true } },
      },
    });
    if (!source) return fail('원본 페이지를 찾을 수 없습니다', 404);

    const parentId = body.parentId !== undefined ? body.parentId : source.treeNode.parentId;
    const title = body.title?.trim() || `${source.treeNode.title} (복사본)`;

    const created = await prisma.$transaction(async (tx) => {
      const maxOrder = await tx.treeNode.aggregate({
        where: { parentId: parentId ?? null },
        _max: { order: true },
      });
      const node = await tx.treeNode.create({
        data: {
          parentId: parentId ?? null,
          type: 'page',
          title,
          icon: source.treeNode.icon,
          order: (maxOrder._max.order ?? -1) + 1,
        },
      });
      const page = await tx.page.create({
        data: {
          treeNodeId: node.id,
          contentMarkdown: source.contentMarkdown,
          contentJson: source.contentJson ?? Prisma.DbNull,
          status: 'Draft',
          authorName: author,
        },
      });
      // 태그 복사
      if (source.tags.length > 0) {
        await tx.pageTag.createMany({
          data: source.tags.map((t) => ({ pageId: page.id, tagId: t.tagId })),
          skipDuplicates: true,
        });
      }
      // 감사 로그
      await tx.auditLog.create({
        data: {
          entity: 'Page',
          entityId: page.id,
          action: 'duplicate',
          before: { sourceId: source.id, sourceTitle: source.treeNode.title },
          after: { title, parentId },
          actor: author,
        },
      });
      return { node, page };
    });

    return ok(
      { node: created.node, page: created.page, pageId: created.page.id },
      { status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}
