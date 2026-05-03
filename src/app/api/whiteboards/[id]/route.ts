/**
 * 화이트보드 단건 — FR-1201 / FR-1210
 *
 * GET /api/whiteboards/[id]   메타 + viewport + elements 전체
 * PUT /api/whiteboards/[id]   전체 viewport + elements 일괄 저장
 *   - 단순 구현: 기존 elements 모두 삭제 후 재삽입.
 *   - 30명 규모, 캔버스당 요소 수 ~수백 개 가정.
 *   - TODO: tldraw 의 incremental update 모델 도입 시 PATCH 분기 추가.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const wb = await prisma.whiteboard.findUnique({
      where: { id: params.id },
      include: {
        elements: {
          orderBy: { zIndex: 'asc' },
          include: { votes: { select: { voterName: true } } },
        },
        treeNode: true,
      },
    });
    if (!wb) return fail('화이트보드를 찾을 수 없습니다', 404);
    return ok(wb);
  } catch (err) {
    return handleError(err);
  }
}

const ElementSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['sticky', 'text', 'shape', 'arrow', 'sticker', 'frame']),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  contentJson: z.any().optional(),
  parentFrameId: z.string().nullable().optional(),
  zIndex: z.number().int().default(0),
});

const PutSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  viewportJson: z.any().optional(),
  elements: z.array(ElementSchema).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, PutSchema);
    const wb = await prisma.whiteboard.findUnique({ where: { id: params.id } });
    if (!wb) return fail('화이트보드를 찾을 수 없습니다', 404);

    const updated = await prisma.$transaction(async (tx) => {
      const meta = await tx.whiteboard.update({
        where: { id: params.id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.viewportJson !== undefined ? { viewportJson: body.viewportJson } : {}),
        },
      });

      if (body.elements) {
        // 단순 전량 교체
        await tx.whiteboardElement.deleteMany({ where: { whiteboardId: params.id } });
        for (const el of body.elements) {
          await tx.whiteboardElement.create({
            data: {
              whiteboardId: params.id,
              type: el.type,
              x: el.x,
              y: el.y,
              width: el.width,
              height: el.height,
              contentJson: el.contentJson ?? null,
              parentFrameId: el.parentFrameId ?? null,
              zIndex: el.zIndex,
            },
          });
        }
      }
      return meta;
    });

    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
