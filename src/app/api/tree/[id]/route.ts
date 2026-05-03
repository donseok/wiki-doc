import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError, fail } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UpdateNodeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  icon: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  order: z.number().int().optional(),
});

/**
 * PATCH /api/tree/[id]   { title?, icon?, parentId?, order? }
 *  - rename, move (FR-103 DnD), reorder
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, UpdateNodeSchema);

    // 순환 방지: parentId 변경 시 자기 자신 또는 후손으로 이동 불가
    if (body.parentId) {
      if (body.parentId === params.id) return fail('자기 자신을 부모로 지정할 수 없습니다');
      const isDescendant = await ensureNotDescendant(params.id, body.parentId);
      if (isDescendant) return fail('하위 노드를 부모로 지정할 수 없습니다');
    }

    const updated = await prisma.treeNode.update({
      where: { id: params.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.icon !== undefined ? { icon: body.icon ?? null } : {}),
        ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
        ...(body.order !== undefined ? { order: body.order } : {}),
      },
    });
    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}

/**
 * DELETE /api/tree/[id]
 * 트리 노드 + 하위 페이지/화이트보드 cascade 삭제. 삭제 감사 로그 기록.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = getCurrentUserServer();
    const node = await prisma.treeNode.findUnique({
      where: { id: params.id },
      include: { page: true },
    });
    if (!node) return fail('노드를 찾을 수 없습니다', 404);

    await prisma.$transaction([
      prisma.auditLog.create({
        data: {
          entity: 'TreeNode',
          entityId: params.id,
          action: 'delete',
          before: {
            title: node.title,
            type: node.type,
            parentId: node.parentId,
          },
          actor,
        },
      }),
      prisma.treeNode.delete({ where: { id: params.id } }),
    ]);
    return ok({ deletedId: params.id });
  } catch (err) {
    return handleError(err);
  }
}

async function ensureNotDescendant(nodeId: string, candidateParent: string): Promise<boolean> {
  let cursor: string | null = candidateParent;
  while (cursor) {
    if (cursor === nodeId) return true;
    const parent: { parentId: string | null } | null = await prisma.treeNode.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
  return false;
}
