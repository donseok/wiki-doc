/**
 * 코멘트 이모지 반응 토글 — FR-506
 *
 * POST /api/comments/[id]/reactions   { emoji: string }
 *   - 본인이 이미 해당 이모지를 누른 상태 → 제거
 *   - 누르지 않은 상태 → 추가
 *   - reactions JSON 형식: { "👍": ["user1","user2"], "❤️": ["user3"] }
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';
import { ok, fail, parseJson, handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ReactionSchema = z.object({
  emoji: z.string().min(1).max(8),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, ReactionSchema);
    const me = getCurrentUserServer();

    const c = await prisma.comment.findUnique({
      where: { id: params.id },
      select: { id: true, reactions: true },
    });
    if (!c) return fail('코멘트를 찾을 수 없습니다', 404);

    const current = (c.reactions as Record<string, string[]> | null) ?? {};
    const list = current[body.emoji] ?? [];
    const has = list.includes(me);

    const next: Record<string, string[]> = { ...current };
    if (has) {
      const filtered = list.filter((u) => u !== me);
      if (filtered.length === 0) delete next[body.emoji];
      else next[body.emoji] = filtered;
    } else {
      next[body.emoji] = Array.from(new Set([...list, me]));
    }

    const updated = await prisma.comment.update({
      where: { id: params.id },
      data: { reactions: next },
      select: { id: true, reactions: true },
    });

    return ok({ id: updated.id, reactions: updated.reactions, toggled: !has });
  } catch (err) {
    return handleError(err);
  }
}
