/**
 * 카드 → 페이지 승격 — FR-605
 *
 * POST /api/cards/[id]/promote   { parentId?, title? }
 *  - 카드 본문을 새 페이지의 contentMarkdown 으로 옮긴다.
 *  - parentId(트리 부모 노드) 미지정 시 루트.
 *  - 카드의 linkedPageId 에 신규 페이지 연결 (이력 추적).
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';
import { ok, parseJson, handleError, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  parentId: z.string().nullable().optional(),
  title: z.string().min(1).max(200).optional(),
  templateId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, Schema);
    const author = getCurrentUserServer();

    const card = await prisma.card.findUnique({ where: { id: params.id } });
    if (!card) return fail('카드를 찾을 수 없습니다', 404);
    if (card.linkedPageId) {
      return fail('이미 페이지로 승격된 카드입니다', 409, { pageId: card.linkedPageId });
    }

    const title = body.title ?? card.title;

    // 템플릿 적용 시 변수 치환된 본문 + 카드 본문 결합
    let initialMarkdown = '';
    if (body.templateId) {
      const tmpl = await prisma.template.findUnique({ where: { id: body.templateId } });
      if (tmpl) {
        const { applyTemplateVariables } = await import('@/lib/templates');
        initialMarkdown = applyTemplateVariables(tmpl.contentMarkdown, { author, title });
        if (card.body) {
          initialMarkdown = `${initialMarkdown}\n\n---\n\n## 원본 카드 내용\n\n${card.body}\n`;
        }
      }
    } else if (card.body) {
      initialMarkdown = `${card.body}\n`;
    }

    const created = await prisma.$transaction(async (tx) => {
      const maxOrder = await tx.treeNode.aggregate({
        where: { parentId: body.parentId ?? null },
        _max: { order: true },
      });
      const node = await tx.treeNode.create({
        data: {
          parentId: body.parentId ?? null,
          type: 'page',
          title,
          order: (maxOrder._max.order ?? -1) + 1,
        },
      });
      const page = await tx.page.create({
        data: {
          treeNodeId: node.id,
          contentMarkdown: initialMarkdown,
          authorName: author,
        },
      });
      await tx.card.update({
        where: { id: card.id },
        data: { linkedPageId: page.id },
      });
      return { node, page };
    });

    return ok({ node: created.node, page: created.page, pageId: created.page.id }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
