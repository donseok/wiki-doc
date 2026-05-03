import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError, fail } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/pages/[id]
 * 페이지 본문 + 메타정보 + 태그 + 트리노드.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const page = await prisma.page.findUnique({
      where: { id: params.id },
      include: {
        treeNode: true,
        tags: { include: { tag: true } },
        editSessions: true,
      },
    });
    if (!page) return fail('페이지를 찾을 수 없습니다', 404);
    return ok(page);
  } catch (err) {
    return handleError(err);
  }
}

const UpdatePageSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  contentMarkdown: z.string().optional(),
  contentJson: z.any().optional(),
  status: z.enum(['Draft', 'Review', 'Approved', 'Pending', 'Archived']).optional(),
  pendingReason: z.string().nullable().optional(),
  versionSummary: z.string().optional(),
});

/**
 * PUT /api/pages/[id]
 * 본문/제목/상태 업데이트 + 자동 버전 저장(FR-401) + 상태 이력(FR-703).
 *
 * Edit Lock 검증:
 *   - 활성 Lock이 본인이 아니면 409 반환 (FR-215).
 *   - Lock이 없거나 본인 Lock이면 진행.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, UpdatePageSchema);
    const author = getCurrentUserServer();

    const page = await prisma.page.findUnique({
      where: { id: params.id },
      include: { treeNode: true, editSessions: true },
    });
    if (!page) return fail('페이지를 찾을 수 없습니다', 404);

    // Edit Lock 검증
    const lock = page.editSessions[0];
    if (lock && lock.editorName !== author && lock.expiresAt > new Date()) {
      return fail(`${lock.editorName}님이 편집 중입니다`, 409, {
        lockHolder: lock.editorName,
        lockExpiresAt: lock.expiresAt,
      });
    }

    const next = await prisma.$transaction(async (tx) => {
      // 1) 제목 변경 시 트리노드 동기화
      if (body.title && body.title !== page.treeNode.title) {
        await tx.treeNode.update({
          where: { id: page.treeNode.id },
          data: { title: body.title },
        });
      }

      // 2) 자동 버전 저장 (본문 변경 시에만)
      const contentChanged =
        body.contentMarkdown !== undefined && body.contentMarkdown !== page.contentMarkdown;
      if (contentChanged) {
        const lastVersion = await tx.pageVersion.findFirst({
          where: { pageId: page.id },
          orderBy: { versionNo: 'desc' },
          select: { versionNo: true },
        });
        await tx.pageVersion.create({
          data: {
            pageId: page.id,
            versionNo: (lastVersion?.versionNo ?? 0) + 1,
            contentMarkdown: page.contentMarkdown,
            contentJson: page.contentJson ?? Prisma.DbNull,
            summary: body.versionSummary,
            authorName: page.authorName,
          },
        });
      }

      // 3) 상태 변경 이력
      if (body.status && body.status !== page.status) {
        await tx.pageStatusLog.create({
          data: {
            pageId: page.id,
            fromStatus: page.status,
            toStatus: body.status,
            changedBy: author,
            note: body.pendingReason ?? undefined,
          },
        });
      }

      // 4) Page 업데이트
      const updated = await tx.page.update({
        where: { id: page.id },
        data: {
          ...(body.contentMarkdown !== undefined ? { contentMarkdown: body.contentMarkdown } : {}),
          ...(body.contentJson !== undefined ? { contentJson: body.contentJson } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.pendingReason !== undefined
            ? { pendingReason: body.pendingReason ?? null }
            : {}),
        },
      });
      return { updated, contentChanged };
    });

    // 5) Action Items 동기화 (FR-1007) — 본문이 바뀐 경우에만
    if (next.contentChanged && body.contentMarkdown !== undefined) {
      try {
        const { syncActionItems } = await import('@/lib/action-items');
        await syncActionItems(page.id, body.contentMarkdown);
      } catch (e) {
        // 동기화 실패는 저장 자체를 막지 않는다 — 로그만 남김
        console.warn('[ActionItems] sync 실패', e);
      }
    }

    // 6) 챗봇/RAG 청크 재색인 — 비용 제어를 위해 AI_AUTO_INDEX_ON_SAVE=true 일 때만 백그라운드 실행
    if (next.contentChanged) {
      try {
        const { schedulePageReindex } = await import('@/lib/chat/page-index');
        schedulePageReindex(page.id);
      } catch (e) {
        console.warn('[ChatIndex] schedule 실패', e);
      }
    }

    // 7) Decision 블록 동기화 (FR-507/508) — TipTap doc JSON 인 경우에만
    let injectedContentJson: unknown | null = null;
    if (body.contentJson !== undefined && body.contentJson !== null) {
      try {
        const { syncDecisions, isTipTapDoc } = await import('@/lib/decisions');
        if (isTipTapDoc(body.contentJson)) {
          const sync = await syncDecisions(page.id, body.contentJson);
          if (sync.mutated && sync.contentJson) {
            // 클라이언트가 주입된 decisionId 를 다음 저장 시 사용할 수 있도록 contentJson 갱신
            await prisma.page.update({
              where: { id: page.id },
              data: { contentJson: sync.contentJson as never },
            });
            injectedContentJson = sync.contentJson;
          }
        }
      } catch (e) {
        console.warn('[Decisions] sync 실패', e);
      }
    }

    // 8) Watch 알림 발송 (FR-905) — 본문 변경 또는 상태 변경 시
    if (next.contentChanged || (body.status && body.status !== page.status)) {
      try {
        const { notifyPageChange } = await import('@/lib/notify');
        const evtType =
          body.status && body.status !== page.status ? 'status_change' : 'page_updated';
        await notifyPageChange({
          pageId: page.id,
          type: evtType,
          actor: author,
          payload: {
            title: page.treeNode.title,
            message:
              evtType === 'status_change'
                ? `${author}님이 "${page.treeNode.title}" 의 상태를 ${body.status} 로 변경했습니다`
                : `${author}님이 "${page.treeNode.title}" 페이지를 수정했습니다`,
          },
        });
      } catch (e) {
        console.warn('[Notify] page change 실패', e);
      }
    }

    return ok({ ...next.updated, ...(injectedContentJson ? { contentJson: injectedContentJson } : {}) });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * DELETE /api/pages/[id] — 트리 노드 cascade 삭제.
 * 트리 API와 일관성 위해 보통 /api/tree/[id] 사용을 권장.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = getCurrentUserServer();
    const page = await prisma.page.findUnique({
      where: { id: params.id },
      select: { treeNodeId: true, contentMarkdown: true, status: true },
    });
    if (!page) return fail('페이지를 찾을 수 없습니다', 404);
    await prisma.$transaction([
      prisma.auditLog.create({
        data: {
          entity: 'Page',
          entityId: params.id,
          action: 'delete',
          before: page,
          actor,
        },
      }),
      prisma.treeNode.delete({ where: { id: page.treeNodeId } }),
    ]);
    return ok({ deletedId: params.id });
  } catch (err) {
    return handleError(err);
  }
}
