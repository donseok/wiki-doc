/**
 * 화이트보드 코멘트 — FR-1211
 *
 * Comment 모델 재사용 — whiteboardId 로 연결.
 *  - GET   목록 (flat + parentId)
 *  - POST  생성 (anchorRange 로 캔버스 좌표 또는 shape ID 부착 가능)
 *
 * anchorRange 형식 (화이트보드 전용):
 *   { kind: 'whiteboard-pin', x: number, y: number }     — 캔버스 임의 좌표
 *   { kind: 'whiteboard-shape', shapeId: string }        — 특정 tldraw shape
 *   undefined                                            — 빈 공간/일반 코멘트
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';
import { ok, fail, parseJson, handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const u = new URL(req.url);
    const includeResolved = u.searchParams.get('includeResolved') !== 'false';

    // params.id 가 Whiteboard.id 또는 TreeNode.id 둘 다 허용 (사이드바 링크 호환)
    const wb = await prisma.whiteboard.findFirst({
      where: { OR: [{ id: params.id }, { treeNodeId: params.id }] },
      select: { id: true },
    });
    if (!wb) return fail('화이트보드를 찾을 수 없습니다', 404);

    const comments = await prisma.comment.findMany({
      where: {
        whiteboardId: wb.id,
        ...(includeResolved ? {} : { resolved: false }),
      },
      orderBy: [{ createdAt: 'asc' }],
    });
    return ok(comments);
  } catch (err) {
    return handleError(err);
  }
}

const AnchorSchema = z
  .object({
    kind: z.enum(['whiteboard-pin', 'whiteboard-shape']),
    x: z.number().optional(),
    y: z.number().optional(),
    shapeId: z.string().optional(),
  })
  .refine((v) => {
    if (v.kind === 'whiteboard-pin') return typeof v.x === 'number' && typeof v.y === 'number';
    if (v.kind === 'whiteboard-shape') return typeof v.shapeId === 'string';
    return true;
  }, { message: 'anchor 좌표 또는 shapeId 가 필요합니다' });

const CreateSchema = z.object({
  body: z.string().min(1).max(5000),
  parentId: z.string().nullable().optional(),
  anchorRange: AnchorSchema.nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, CreateSchema);
    const author = getCurrentUserServer();

    const wb = await prisma.whiteboard.findFirst({
      where: { OR: [{ id: params.id }, { treeNodeId: params.id }] },
      select: { id: true, title: true, treeNodeId: true },
    });
    if (!wb) return fail('화이트보드를 찾을 수 없습니다', 404);

    if (body.parentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: body.parentId, whiteboardId: wb.id },
        select: { id: true },
      });
      if (!parent) return fail('상위 코멘트를 찾을 수 없습니다', 400);
    }

    const created = await prisma.comment.create({
      data: {
        whiteboardId: wb.id,
        parentId: body.parentId ?? null,
        body: body.body,
        anchorRange: (body.anchorRange ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        authorName: author,
      },
    });

    // 멘션 알림 (이메일 포함) — pageId 가 없으므로 generic 메시지로
    try {
      const matches = Array.from(body.body.matchAll(/@([\w가-힣.\-_]+)/g));
      const targets = Array.from(new Set(matches.map((m) => m[1]))).filter((u) => u !== author);
      if (targets.length > 0) {
        const data = targets.map((recipient) => ({
          recipient,
          type: 'mention' as const,
          payload: {
            whiteboardId: wb.id,
            actor: author,
            snippet: body.body.slice(0, 200),
            message: `${author}님이 화이트보드 "${wb.title}" 의 코멘트에서 @${recipient} 를 멘션했습니다`,
          },
        }));
        await prisma.notification.createMany({ data });
        const { maybeSendEmailForNotification } = await import('@/lib/email');
        await Promise.allSettled(
          data.map((n) =>
            maybeSendEmailForNotification({
              recipient: n.recipient,
              type: n.type,
              payload: n.payload,
            }),
          ),
        );
      }
    } catch (e) {
      console.warn('[whiteboard-comments] mention notify 실패', e);
    }

    return ok(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
