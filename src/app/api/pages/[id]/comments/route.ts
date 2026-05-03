/**
 * 페이지 코멘트 — FR-501 ~ FR-506
 *
 * GET  /api/pages/[id]/comments       페이지 코멘트 목록 (flat + parentId)
 *   - includeResolved=true 쿼리로 해결된 코멘트 포함
 *   - 기본은 모두 반환 (UI에서 'Resolved 보기' 토글로 필터링)
 * POST /api/pages/[id]/comments       새 코멘트 (인라인 anchorRange 지원)
 *
 * 알림: 코멘트 생성 시 watcher 들에게 'comment' 알림 + 멘션 시 'mention' 알림.
 *
 * anchorRange 형식 (FR-502):
 *   { from: number, to: number, quote: string }
 *   - TipTap ProseMirror 의 텍스트 위치 (from/to)
 *   - quote: 인용된 본문 텍스트 스냅샷 (본문이 변경돼도 표시 가능하도록)
 *
 * 응답 형식 (flat):
 *   [{ id, pageId, parentId, body, anchorRange, authorName, resolved, reactions, createdAt, updatedAt }]
 *   클라이언트에서 parentId 기준으로 트리 구성. (Sprint 3 스펙: flat 단순)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';
import { ok, fail, parseJson, handleError } from '@/lib/api';
import { notifyMention, notifyPageChange } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const u = new URL(req.url);
    const includeResolvedParam = u.searchParams.get('includeResolved') ?? u.searchParams.get('resolved');
    // 기본 true: 클라이언트 필터링이 더 자연스럽다 (Resolved 보기 토글)
    const includeResolved = includeResolvedParam !== 'false';

    const page = await prisma.page.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!page) return fail('페이지를 찾을 수 없습니다', 404);

    const comments = await prisma.comment.findMany({
      where: {
        pageId: params.id,
        ...(includeResolved ? {} : { resolved: false }),
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    // flat 그대로 반환 (parentId 포함). 클라이언트에서 트리 구성.
    return ok(comments);
  } catch (err) {
    return handleError(err);
  }
}

const AnchorRangeSchema = z
  .object({
    from: z.number().int().min(0),
    to: z.number().int().min(0),
    quote: z.string().max(2000).optional(),
  })
  .strict()
  .nullable()
  .optional();

const CreateCommentSchema = z.object({
  body: z.string().min(1).max(5000),
  parentId: z.string().nullable().optional(),
  anchorRange: AnchorRangeSchema,
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, CreateCommentSchema);
    const author = getCurrentUserServer();

    const page = await prisma.page.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!page) return fail('페이지를 찾을 수 없습니다', 404);

    // 답글인 경우 부모 코멘트가 같은 페이지인지 검증
    if (body.parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: body.parentId },
        select: { pageId: true },
      });
      if (!parent || parent.pageId !== params.id) {
        return fail('상위 코멘트를 찾을 수 없습니다', 400);
      }
    }

    const created = await prisma.comment.create({
      data: {
        pageId: params.id,
        parentId: body.parentId ?? null,
        body: body.body,
        anchorRange: body.anchorRange ?? Prisma.JsonNull,
        authorName: author,
      },
    });

    // 알림: 페이지 watcher (자기 자신 제외) + 본문에서 추출한 멘션
    await Promise.all([
      notifyPageChange({
        pageId: params.id,
        type: 'comment',
        actor: author,
        payload: { commentId: created.id, snippet: body.body.slice(0, 200) },
      }),
      notifyMention({ pageId: params.id, actor: author, body: body.body }),
    ]);

    return ok(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
