/**
 * 첨부 파일 — FR-1101 ~ FR-1109
 *
 * POST /api/attachments         multipart/form-data { file, pageId? }
 *   - 이미지/PDF/Excel/Word/PPT/zip/text 모두 허용 (개별 50MB, 이미지 10MB)
 *   - UPLOAD_DIR 하위에 YYYYMMDD/<uuid>__<원본명> 으로 저장
 *
 * GET /api/attachments?pageId=...  특정 페이지의 첨부 목록 (FR-1109)
 *
 * TODO:
 *   - 컴포넌트 측 PDF.js / SheetJS 미리보기 (src/components/attachments/README.md 참조)
 *   - FR-1103 고아 이미지 정리(스케줄러)
 */

import { NextRequest } from 'next/server';
import { handleError, ok, fail } from '@/lib/api';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';
import {
  classifyFileType,
  validateAttachmentSize,
  makeStoragePath,
  UPLOAD_DIR,
} from '@/lib/attachments';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const pageId = u.searchParams.get('pageId');
    const where = pageId ? { pageId } : {};
    const list = await prisma.attachment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return ok(list);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const pageId = (form.get('pageId') as string | null) || null;

    if (!(file instanceof File)) {
      return fail('file 필드가 필요합니다', 400);
    }
    if (!file.size) return fail('빈 파일입니다', 400);

    const fileType = classifyFileType(file.type, file.name);
    const sizeCheck = validateAttachmentSize(fileType, file.size);
    if (!sizeCheck.ok) {
      return fail(`파일 크기가 ${sizeCheck.limitMb}MB 를 초과합니다`, 413);
    }

    const { relPath } = makeStoragePath(file.name);
    const absPath = path.join(UPLOAD_DIR, relPath);
    await mkdir(path.dirname(absPath), { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(absPath, buf);

    const created = await prisma.attachment.create({
      data: {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileType,
        path: relPath,
        size: file.size,
        pageId: pageId ?? null,
        uploaderName: getCurrentUserServer(),
      },
    });
    return ok(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
