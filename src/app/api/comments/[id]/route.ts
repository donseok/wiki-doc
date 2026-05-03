/**
 * 코멘트 단건 — FR-505 (Resolve), FR-506 (이모지 반응)
 *
 * PATCH /api/comments/[id]   { body?, resolved?, addReaction?, removeReaction? }
 *   - body: 본문 수정 (작성자만 — Sprint 1 인증 미적용이므로 검증 약식)
 *   - resolved: Resolve / 재오픈 토글
 *   - addReaction / removeReaction: 이모지 반응 추가/제거 (POST /reactions 와 별개로 PATCH 에서도 지원)
 *
 * DELETE /api/comments/[id]   코멘트 삭제 (스레드 답글은 onDelete: Cascade 로 함께 삭제)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';
import { ok, fail, parseJson, handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z
  .object({
    body: z.string().min(1).max(5000).optional(),
    resolved: z.boolean().optional(),
    addReaction: z.string().min(1).max(8).optional(),
    removeReaction: z.string().min(1).max(8).optional(),
  })
  .refine(
    (v) =>
      v.body !== undefined ||
      v.resolved !== undefined ||
      v.addReaction !== undefined ||
      v.removeReaction !== undefined,
    { message: '변경할 필드가 없습니다' },
  );

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, PatchSchema);
    const me = getCurrentUserServer();

    const c = await prisma.comment.findUnique({ where: { id: params.id } });
    if (!c) return fail('코멘트를 찾을 수 없습니다', 404);

    // 이모지 반응 병합 (FR-506)
    let nextReactions = (c.reactions as Record<string, string[]> | null) ?? {};
    if (body.addReaction) {
      const arr = new Set(nextReactions[body.addReaction] ?? []);
      arr.add(me);
      nextReactions = { ...nextReactions, [body.addReaction]: Array.from(arr) };
    }
    if (body.removeReaction) {
      const filtered = (nextReactions[body.removeReaction] ?? []).filter((u) => u !== me);
      nextReactions = { ...nextReactions, [body.removeReaction]: filtered };
      if (filtered.length === 0) delete nextReactions[body.removeReaction];
    }

    const updated = await prisma.comment.update({
      where: { id: params.id },
      data: {
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.resolved !== undefined ? { resolved: body.resolved } : {}),
        ...(body.addReaction || body.removeReaction ? { reactions: nextReactions } : {}),
      },
    });
    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const c = await prisma.comment.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!c) return fail('코멘트를 찾을 수 없습니다', 404);
    await prisma.comment.delete({ where: { id: params.id } });
    return ok({ deletedId: params.id });
  } catch (err) {
    return handleError(err);
  }
}
