/**
 * 태그 단건 관리 — FR-805 (병합/삭제)
 *
 * PATCH  /api/tags/[id]   { name?, color?, mergeIntoId? }
 *   - mergeIntoId 지정 시 source(이 id) → target(mergeIntoId) 으로 병합 후 source 삭제
 * DELETE /api/tags/[id]   해당 태그 삭제 (PageTag cascade)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError, fail } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/current-user';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().max(20).nullable().optional(),
  mergeIntoId: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // TODO(NFR-303): admin role check
    const actor = getCurrentUserServer();
    const body = await parseJson(req, PatchSchema);

    const isMerge = !!body.mergeIntoId && body.mergeIntoId !== params.id;
    const [source, target] = await Promise.all([
      prisma.tag.findUnique({ where: { id: params.id } }),
      isMerge ? prisma.tag.findUnique({ where: { id: body.mergeIntoId! } }) : Promise.resolve(null),
    ]);
    if (!source) return fail('태그를 찾을 수 없습니다', 404);

    if (isMerge) {
      if (!target) return fail('병합 대상 태그를 찾을 수 없습니다', 404);

      const merged = await prisma.$transaction(async (tx) => {
        const pageTags = await tx.pageTag.findMany({ where: { tagId: params.id } });
        if (pageTags.length > 0) {
          await tx.pageTag.createMany({
            data: pageTags.map((pt) => ({ pageId: pt.pageId, tagId: target.id })),
            skipDuplicates: true,
          });
        }
        await tx.pageTag.deleteMany({ where: { tagId: params.id } });
        await tx.tag.delete({ where: { id: params.id } });
        await writeAudit(
          {
            entity: 'Tag',
            entityId: params.id,
            action: 'merge',
            before: source,
            after: { mergedInto: target.id, mergedIntoName: target.name },
            actor,
          },
          tx,
        );
        return tx.tag.findUnique({ where: { id: target.id } });
      });

      return ok(merged);
    }

    // 일반 수정
    const updated = await prisma.tag.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.color !== undefined ? { color: body.color ?? null } : {}),
      },
    });

    await writeAudit({
      entity: 'Tag',
      entityId: params.id,
      action: 'update',
      before: source,
      after: updated,
      actor,
    });

    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // TODO(NFR-303): admin role check
    const actor = getCurrentUserServer();
    const existing = await prisma.tag.findUnique({ where: { id: params.id } });
    if (!existing) return fail('태그를 찾을 수 없습니다', 404);

    await prisma.$transaction(async (tx) => {
      await writeAudit(
        {
          entity: 'Tag',
          entityId: params.id,
          action: 'delete',
          before: existing,
          actor,
        },
        tx,
      );
      await tx.tag.delete({ where: { id: params.id } });
    });

    return ok({ deletedId: params.id });
  } catch (err) {
    return handleError(err);
  }
}
