/**
 * 고아 첨부 정리 — FR-1103
 *
 * GET   /api/admin/orphans         감지된 고아 첨부 목록 (dry-run)
 * DELETE /api/admin/orphans        고아 첨부 일괄 삭제 + 파일 시스템 정리
 *
 * 고아 정의:
 *  1) Attachment.pageId IS NULL  AND  본문에서 /api/attachments/<id> 참조 없음
 *  2) Attachment.pageId 가 존재하지만 해당 페이지 본문에서 더 이상 참조 안 됨
 *
 * 1) 감지: 모든 페이지 본문 markdown 을 합쳐 정규식으로 attachment ID 추출 →
 *         Attachment 테이블과 차집합.
 * 2) 삭제: AuditLog 에 사후 기록 + 파일 시스템에서 실제 파일 unlink (best effort).
 *
 * TODO(NFR-303): 인증 도입 시 admin role 체크.
 */

import { NextRequest } from 'next/server';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { ok, fail, handleError } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/current-user';
import { UPLOAD_DIR } from '@/lib/attachments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 본문에서 첨부 ID 추출 정규식 (인라인 마크다운/HTML/JSON 모두 커버) */
const ATT_RE = /\/api\/attachments\/([a-zA-Z0-9_-]+)/g;

async function detectOrphans() {
  const [attachments, pages] = await Promise.all([
    prisma.attachment.findMany({
      select: { id: true, filename: true, path: true, size: true, fileType: true, pageId: true, createdAt: true },
    }),
    prisma.page.findMany({
      select: { contentMarkdown: true, contentJson: true },
    }),
  ]);

  // 모든 페이지 본문에서 참조된 첨부 ID 수집
  const referenced = new Set<string>();
  for (const p of pages) {
    if (p.contentMarkdown) {
      for (const m of p.contentMarkdown.matchAll(ATT_RE)) referenced.add(m[1]);
    }
    if (p.contentJson) {
      const json = JSON.stringify(p.contentJson);
      for (const m of json.matchAll(ATT_RE)) referenced.add(m[1]);
    }
  }

  return attachments.filter((a) => !referenced.has(a.id));
}

export async function GET() {
  try {
    const orphans = await detectOrphans();
    const totalSize = orphans.reduce((sum, a) => sum + (a.size ?? 0), 0);
    return ok({
      count: orphans.length,
      totalBytes: totalSize,
      orphans: orphans.map((a) => ({
        id: a.id,
        filename: a.filename,
        size: a.size,
        fileType: a.fileType,
        pageId: a.pageId,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    const actor = getCurrentUserServer();
    const orphans = await detectOrphans();
    if (orphans.length === 0) {
      return ok({ deleted: 0, totalBytes: 0 });
    }

    const ids = orphans.map((o) => o.id);
    const totalBytes = orphans.reduce((s, a) => s + (a.size ?? 0), 0);

    // DB 트랜잭션
    await prisma.$transaction([
      prisma.auditLog.create({
        data: {
          entity: 'Attachment',
          entityId: 'orphan-cleanup',
          action: 'cleanup',
          before: { ids, count: ids.length, totalBytes },
          actor,
        },
      }),
      prisma.attachment.deleteMany({ where: { id: { in: ids } } }),
    ]);

    // 파일 시스템 정리 (best effort — 실패해도 DB 정리는 유지)
    let unlinkOk = 0;
    let unlinkFail = 0;
    for (const o of orphans) {
      const abs = path.resolve(UPLOAD_DIR, o.path);
      try {
        await unlink(abs);
        unlinkOk++;
      } catch {
        unlinkFail++;
      }
    }

    return ok({
      deleted: ids.length,
      totalBytes,
      filesRemoved: unlinkOk,
      filesMissing: unlinkFail,
    });
  } catch (err) {
    return handleError(err);
  }
}
