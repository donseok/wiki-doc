import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, fail, parseJson, handleError } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/tree
 * 전체 트리를 평탄한 배열로 반환 (parentId, order 정렬). UI에서 트리로 재구성.
 */
export async function GET() {
  try {
    const nodes = await prisma.treeNode.findMany({
      orderBy: [{ parentId: 'asc' }, { order: 'asc' }],
      select: {
        id: true,
        parentId: true,
        type: true,
        title: true,
        icon: true,
        order: true,
        page: { select: { status: true } },
      },
    });
    return ok(nodes);
  } catch (err) {
    return handleError(err);
  }
}

const CreateNodeSchema = z.object({
  parentId: z.string().nullable().optional(),
  type: z.enum(['folder', 'page', 'whiteboard']).default('page'),
  title: z.string().min(1).max(200),
  icon: z.string().optional(),
  templateId: z.string().optional(),
});

/**
 * POST /api/tree   { parentId, type, title, icon?, templateId? }
 * - folder: 빈 폴더 생성
 * - page:   TreeNode + 빈 Page 생성 (templateId 지정 시 템플릿 본문 적용)
 * - whiteboard: TreeNode + 빈 Whiteboard 생성
 */
export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, CreateNodeSchema);
    const author = getCurrentUserServer();

    // 같은 부모 하위 마지막 순서 + 1
    const maxOrder = await prisma.treeNode.aggregate({
      where: { parentId: body.parentId ?? null },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const created = await prisma.$transaction(async (tx) => {
      const node = await tx.treeNode.create({
        data: {
          parentId: body.parentId ?? null,
          type: body.type,
          title: body.title,
          icon: body.icon,
          order: nextOrder,
        },
      });

      if (body.type === 'page') {
        // 템플릿 적용 (선택)
        let contentMarkdown = '';
        if (body.templateId) {
          const tmpl = await tx.template.findUnique({ where: { id: body.templateId } });
          if (tmpl) {
            const { applyTemplateVariables } = await import('@/lib/templates');
            contentMarkdown = applyTemplateVariables(tmpl.contentMarkdown, {
              author,
              title: body.title,
            });
          }
        }
        await tx.page.create({
          data: {
            treeNodeId: node.id,
            contentMarkdown,
            authorName: author,
          },
        });
      } else if (body.type === 'whiteboard') {
        await tx.whiteboard.create({
          data: {
            treeNodeId: node.id,
            title: body.title,
          },
        });
      }
      return node;
    });

    return ok(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
