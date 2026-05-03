import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ReorderSchema = z.object({
  /** 동일 부모 하위 노드들의 새로운 순서 (배열의 인덱스 = order). */
  parentId: z.string().nullable(),
  orderedIds: z.array(z.string()).min(1),
});

/**
 * POST /api/tree/reorder
 * FR-103 DnD 처리 결과를 일괄 반영.
 */
export async function POST(req: NextRequest) {
  try {
    const { parentId, orderedIds } = await parseJson(req, ReorderSchema);

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.treeNode.update({
          where: { id },
          data: { parentId, order: index },
        }),
      ),
    );
    return ok({ updated: orderedIds.length });
  } catch (err) {
    return handleError(err);
  }
}
