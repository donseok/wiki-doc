/**
 * 첨부 파일 헬퍼 — FR-1101 ~ FR-1109
 *
 * - mimeType → fileType 자동 분류
 * - 파일 크기/형식 검증 (이미지 10MB, 일반 50MB)
 * - 안전한 파일명/저장 경로 생성
 *
 * 추가 라이브러리 필요(컴포넌트 측):
 *   - pdf.js : FR-1106 PDF 인라인 미리보기
 *   - SheetJS(xlsx) : FR-1107 Excel/CSV 미리보기
 *   본 헬퍼는 서버 저장/조회까지만 책임.
 */

import { AttachmentFileType } from '@prisma/client';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_IMAGE_MB = Number(process.env.MAX_IMAGE_SIZE_MB ?? 10);
const MAX_FILE_MB = Number(process.env.MAX_FILE_SIZE_MB ?? 50);

export const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

const MIME_MAP: Array<{ test: (m: string, ext: string) => boolean; type: AttachmentFileType }> = [
  { test: (m) => m.startsWith('image/'), type: 'image' },
  { test: (m) => m === 'application/pdf', type: 'pdf' },
  {
    test: (m, e) =>
      m.includes('spreadsheet') ||
      m === 'application/vnd.ms-excel' ||
      m === 'text/csv' ||
      ['xlsx', 'xls', 'csv'].includes(e),
    type: 'excel',
  },
  {
    test: (m, e) =>
      m.includes('wordprocessingml') ||
      m === 'application/msword' ||
      ['doc', 'docx'].includes(e),
    type: 'word',
  },
  {
    test: (m, e) =>
      m.includes('presentationml') ||
      m === 'application/vnd.ms-powerpoint' ||
      ['ppt', 'pptx'].includes(e),
    type: 'ppt',
  },
  {
    test: (m, e) =>
      m === 'application/zip' || m === 'application/x-zip-compressed' || ['zip', '7z', 'tar', 'gz'].includes(e),
    type: 'zip',
  },
  {
    test: (m, e) => m.startsWith('text/') || ['txt', 'md', 'log', 'json', 'xml', 'yaml', 'yml'].includes(e),
    type: 'text',
  },
];

export function classifyFileType(mimeType: string, filename: string): AttachmentFileType {
  const ext = path.extname(filename).slice(1).toLowerCase();
  const m = (mimeType || '').toLowerCase();
  for (const rule of MIME_MAP) {
    if (rule.test(m, ext)) return rule.type;
  }
  return 'other';
}

/** FR-1101 / FR-1104 크기 제한 검증 */
export function validateAttachmentSize(fileType: AttachmentFileType, sizeBytes: number): {
  ok: boolean;
  limitMb: number;
} {
  const limitMb = fileType === 'image' ? MAX_IMAGE_MB : MAX_FILE_MB;
  return { ok: sizeBytes <= limitMb * 1024 * 1024, limitMb };
}

/**
 * 충돌 없는 저장 파일명 생성.
 * 형식: YYYYMMDD/<uuid>__<원본파일명>
 */
export function makeStoragePath(originalName: string): { relPath: string; safeName: string } {
  const safe = originalName.replace(/[^\w.\-가-힣]+/g, '_').slice(0, 200);
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const id = randomUUID();
  return { relPath: path.posix.join(day, `${id}__${safe}`), safeName: safe };
}

export function isPreviewable(fileType: AttachmentFileType): boolean {
  return fileType === 'image' || fileType === 'pdf' || fileType === 'excel' || fileType === 'text';
}
