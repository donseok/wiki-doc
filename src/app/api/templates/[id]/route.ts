/**
 * 사용자 정의 템플릿 단건 — FR-212
 *
 * GET    /api/templates/[id]      단건 조회
 * PATCH  /api/templates/[id]      이름/설명/카테고리/본문/아이콘 수정
 * DELETE /api/templates/[id]      삭제
 *
 * isSystem=true 인 시스템 템플릿은 수정/삭제 거부.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError, fail } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tpl = await prisma.template.findUnique({ where: { id: params.id } });
    if (!tpl) return fail('템플릿을 찾을 수 없습니다', 404);
    return ok(tpl);
  } catch (err) {
    return handleError(err);
  }
}

const PatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  contentMarkdown: z.string().optional(),
  icon: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // TODO(NFR-303): admin role check
    const actor = getCurrentUserServer();
    const body = await parseJson(req, PatchSchema);

    const existing = await prisma.template.findUnique({ where: { id: params.id } });
    if (!existing) return fail('템플릿을 찾을 수 없습니다', 404);
    if (existing.isSystem) {
      return fail('시스템 템플릿은 수정할 수 없습니다', 403);
    }

    const updated = await prisma.template.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.contentMarkdown !== undefined ? { contentMarkdown: body.contentMarkdown } : {}),
        ...(body.icon !== undefined ? { icon: body.icon } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        entity: 'Template',
        entityId: params.id,
        action: 'update',
        before: existing as unknown as object,
        after: updated as unknown as object,
        actor,
      },
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
    const existing = await prisma.template.findUnique({ where: { id: params.id } });
    if (!existing) return fail('템플릿을 찾을 수 없습니다', 404);
    if (existing.isSystem) {
      return fail('시스템 템플릿은 삭제할 수 없습니다', 403);
    }

    await prisma.$transaction([
      prisma.auditLog.create({
        data: {
          entity: 'Template',
          entityId: params.id,
          action: 'delete',
          before: existing as unknown as object,
          actor,
        },
      }),
      prisma.template.delete({ where: { id: params.id } }),
    ]);

    return ok({ deletedId: params.id });
  } catch (err) {
    return handleError(err);
  }
}
