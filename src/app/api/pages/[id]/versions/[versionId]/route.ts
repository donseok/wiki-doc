/**
 * 단일 페이지 버전 — FR-403 / FR-404
 *
 * GET  /api/pages/[id]/versions/[versionId]              단건 본문 조회 (Diff 모달용)
 * PUT  /api/pages/[id]/versions/[versionId]              { action: 'restore' } 으로 복원
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError, fail } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; versionId: string } },
) {
  try {
    const v = await prisma.pageVersion.findFirst({
      where: { id: params.versionId, pageId: params.id },
    });
    if (!v) return fail('버전을 찾을 수 없습니다', 404);
    return ok(v);
  } catch (err) {
    return handleError(err);
  }
}

const RestoreSchema = z.object({
  action: z.literal('restore'),
  summary: z.string().max(500).optional(),
});

/**
 * 복원 동작 (FR-404):
 *  1) 현재 본문을 새 PageVersion 으로 백업 (versionNo = max+1)
 *  2) 대상 버전 본문을 Page 에 적용
 *  3) 새 PageVersion 한 개 더 생성 — "v{N} 복원" summary
 *
 * 즉 복원 후 두 개의 버전이 추가된다 (백업 + 복원본).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; versionId: string } },
) {
  try {
    const body = await parseJson(req, RestoreSchema);
    const actor = getCurrentUserServer();

    const target = await prisma.pageVersion.findFirst({
      where: { id: params.versionId, pageId: params.id },
    });
    if (!target) return fail('버전을 찾을 수 없습니다', 404);

    const page = await prisma.page.findUnique({
      where: { id: params.id },
      include: { editSessions: true },
    });
    if (!page) return fail('페이지를 찾을 수 없습니다', 404);

    // Edit Lock 검사 — 다른 사용자가 잠근 경우 충돌
    const lock = page.editSessions[0];
    if (lock && lock.editorName !== actor && lock.expiresAt > new Date()) {
      return fail(`${lock.editorName}님이 편집 중입니다`, 409, {
        lockHolder: lock.editorName,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const lastVersion = await tx.pageVersion.findFirst({
        where: { pageId: page.id },
        orderBy: { versionNo: 'desc' },
        select: { versionNo: true },
      });
      const nextVersionNo = (lastVersion?.versionNo ?? 0) + 1;

      // 1) 현재 본문 백업
      await tx.pageVersion.create({
        data: {
          pageId: page.id,
          versionNo: nextVersionNo,
          contentMarkdown: page.contentMarkdown,
          contentJson: page.contentJson ?? Prisma.DbNull,
          summary: `복원 직전 자동 백업 (v${target.versionNo} 복원)`,
          authorName: actor,
        },
      });

      // 2) 대상 버전을 Page 에 적용
      const updated = await tx.page.update({
        where: { id: page.id },
        data: {
          contentMarkdown: target.contentMarkdown,
          contentJson: target.contentJson ?? Prisma.DbNull,
        },
      });

      // 3) 복원본 자체도 새 버전으로 기록 (이력 명시화)
      await tx.pageVersion.create({
        data: {
          pageId: page.id,
          versionNo: nextVersionNo + 1,
          contentMarkdown: target.contentMarkdown,
          contentJson: target.contentJson ?? Prisma.DbNull,
          summary: body.summary ?? `v${target.versionNo} 복원`,
          authorName: actor,
          label: `restored-from-v${target.versionNo}`,
        },
      });

      return updated;
    });

    // 본문 복원 후 Action Items 동기화 (FR-1007)
    try {
      const { syncActionItems } = await import('@/lib/action-items');
      await syncActionItems(page.id, target.contentMarkdown);
    } catch (e) {
      console.warn('[ActionItems] 복원 후 sync 실패', e);
    }

    try {
      const { schedulePageReindex } = await import('@/lib/chat/page-index');
      schedulePageReindex(page.id);
    } catch (e) {
      console.warn('[ChatIndex] 복원 후 schedule 실패', e);
    }

    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
