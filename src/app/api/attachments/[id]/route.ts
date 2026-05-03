/**
 * 첨부 파일 단건 — FR-1105 / FR-1106 / FR-1109
 *
 * GET /api/attachments/[id]     파일 다운로드 (스트림)
 *   - 인라인 표시는 ?disposition=inline 로 (PDF 미리보기 등)
 * DELETE /api/attachments/[id]  파일 + DB 삭제
 *
 * TODO: 권한 체크 (Sprint 1 인증 미적용)
 */

import { NextRequest } from 'next/server';
import { handleError, ok, fail } from '@/lib/api';
import { prisma } from '@/lib/db';
import { UPLOAD_DIR } from '@/lib/attachments';
import { createReadStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const att = await prisma.attachment.findUnique({ where: { id: params.id } });
    if (!att) return fail('첨부 파일을 찾을 수 없습니다', 404);

    const u = new URL(req.url);
    const inline = u.searchParams.get('disposition') === 'inline';

    const absPath = path.join(UPLOAD_DIR, att.path);
    const st = await stat(absPath).catch(() => null);
    if (!st) return fail('파일이 존재하지 않습니다', 410);

    const stream = createReadStream(absPath);
    // Node 스트림 → Web ReadableStream
    const webStream = Readable.toWeb(stream) as unknown as ReadableStream;

    const filenameStar = encodeURIComponent(att.filename);
    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': att.mimeType || 'application/octet-stream',
        'Content-Length': String(st.size),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${filenameStar}`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const att = await prisma.attachment.findUnique({ where: { id: params.id } });
    if (!att) return fail('첨부 파일을 찾을 수 없습니다', 404);

    await prisma.attachment.delete({ where: { id: att.id } });
    const absPath = path.join(UPLOAD_DIR, att.path);
    await unlink(absPath).catch(() => undefined); // 파일이 이미 없어도 무시

    return ok({ deletedId: params.id });
  } catch (err) {
    return handleError(err);
  }
}
