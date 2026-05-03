/**
 * 마크다운 일괄 가져오기 — FR-808 (Round 4 신규)
 *
 * POST /api/admin/import  (multipart/form-data)
 *   Form 필드:
 *     - file:   File (.zip)            — zip 모드
 *     - files:  File[] (.md)           — 다중 모드 (같은 필드명 반복)
 *     - meta:   string (JSON)          — 필수, 아래 스키마
 *
 *   meta JSON:
 *     {
 *       targetNodeId: string;                              // "" = 루트
 *       conflictPolicy: "skip" | "overwrite" | "rename";
 *       preserveFolders: boolean;                          // zip 모드에서만 유효
 *       defaultAuthor?: string;
 *       defaultStatus?: PageStatus;
 *     }
 *
 *   응답: { ok, data: { summary, details, targetNodeId, mode } }
 *
 *   계약 문서: _workspace/02_pm_api_contract.md (v1, 2026-05-03)
 *
 *   안전장치:
 *     - 권한: env IMPORT_ALLOWED_USERS 콤마 분리 / 비어있으면 모두 허용
 *     - 한도: env IMPORT_MAX_ZIP_MB(기본 50) / IMPORT_MAX_FILES(500) / IMPORT_MAX_FILE_KB(1024, per-file 초과는 failed 기록 후 진행)
 *     - 트랜잭션: 모든 DB 변경은 단일 prisma.$transaction. DB 실패 시 전부 롤백.
 *     - frontmatter 파싱 실패는 fallback (제목=파일명, 본문=원문). 깨진 frontmatter도 본문 import 가능.
 *     - overwrite 모드만 Edit Lock 우회 (Lock 보유자가 actor 가 아니면 skip + reason)
 *     - 메모리에서만 처리 (디스크 저장 금지)
 */

import { NextRequest } from 'next/server';
import { Prisma, type PageStatus } from '@prisma/client';
import matter from 'gray-matter';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, fail, handleError } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/current-user';
import { writeAuditSafe } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['Draft', 'Review', 'Approved', 'Pending', 'Archived'] as const;
const RENAME_MAX_SUFFIX = 10;

const MetaSchema = z.object({
  targetNodeId: z.string(),
  conflictPolicy: z.enum(['skip', 'overwrite', 'rename']),
  preserveFolders: z.boolean(),
  defaultAuthor: z.string().optional(),
  defaultStatus: z.enum(VALID_STATUSES).optional(),
});

type Meta = z.infer<typeof MetaSchema>;

interface ParsedEntry {
  /** 사용자에게 노출할 원본 경로 (zip 내부 경로 또는 File.name) — 계약 v1.1 §details.path */
  originalPath: string;
  /** 트리 매핑에 사용할 segment 목록 (zip wrapping 디렉터리 strip 후, files 모드에서는 basename 1개) */
  mappedSegs: string[];
  /** 본문 (frontmatter 제거 후) */
  content: string;
  meta: {
    title: string | null;
    author: string | null;
    status: PageStatus | null;
    tags: string[];
  };
  /** 파싱 전 단계 실패 사유 (있으면 failed로 처리) */
  parseError?: string;
}

interface DetailRow {
  path: string;
  action: 'created' | 'skipped' | 'overwritten' | 'renamed' | 'failed';
  pageId?: string;
  title?: string;
  tagsApplied?: string[];
  reason?: string;
}

export async function POST(req: NextRequest) {
  try {
    const actor = getCurrentUserServer();

    // 1) 권한
    const allowRaw = (process.env.IMPORT_ALLOWED_USERS || '').trim();
    const allow = allowRaw
      ? allowRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    if (allow.length > 0 && !allow.includes(actor)) {
      return fail('이 기능을 사용할 권한이 없습니다', 403);
    }

    // 2) Content-Type
    const ct = req.headers.get('content-type') || '';
    if (!ct.toLowerCase().includes('multipart/form-data')) {
      return fail('multipart/form-data 가 필요합니다', 415);
    }

    // 3) 한도
    const maxZipMB = numEnv('IMPORT_MAX_ZIP_MB', 50);
    const maxFiles = numEnv('IMPORT_MAX_FILES', 500);
    const maxFileKB = numEnv('IMPORT_MAX_FILE_KB', 1024);

    // 4) FormData 파싱
    const fd = await req.formData().catch(() => null);
    if (!fd) return fail('multipart 요청 본문 파싱 실패', 400);

    // 5) meta
    const metaRaw = fd.get('meta');
    if (typeof metaRaw !== 'string' || !metaRaw.trim()) {
      return fail('meta 필드가 누락되었습니다', 400);
    }
    let meta: Meta;
    try {
      meta = MetaSchema.parse(JSON.parse(metaRaw));
    } catch (e) {
      if (e instanceof z.ZodError) {
        return fail('잘못된 meta 형식입니다', 400, { issues: e.issues });
      }
      return fail(`meta JSON 파싱 실패: ${(e as Error).message}`, 400);
    }

    const defaultAuthor = (meta.defaultAuthor ?? '').trim() || actor;
    const defaultStatus: PageStatus = meta.defaultStatus ?? 'Draft';

    // 6) targetNodeId (빈 문자열 = 루트)
    let targetParentId: string | null = null;
    let targetTitle = '루트';
    if (meta.targetNodeId.trim()) {
      const target = await prisma.treeNode.findUnique({
        where: { id: meta.targetNodeId.trim() },
        select: { id: true, type: true, title: true },
      });
      if (!target) return fail('대상 워크스페이스를 찾을 수 없습니다', 404);
      if (target.type !== 'folder') return fail('대상은 폴더 노드여야 합니다', 400);
      targetParentId = target.id;
      targetTitle = target.title;
    }

    // 7) 모드 분기 — file XOR files
    const fileEntry = fd.get('file');
    const filesEntries = fd.getAll('files').filter(
      (it): it is File => it instanceof File && it.size > 0,
    );
    const hasFile = fileEntry instanceof File && fileEntry.size > 0;
    const hasFiles = filesEntries.length > 0;

    if (hasFile && hasFiles) {
      return fail('file 과 files 는 동시에 사용할 수 없습니다', 400);
    }
    if (!hasFile && !hasFiles) {
      return fail('업로드된 파일이 없습니다 (file 또는 files 필요)', 400);
    }

    const mode: 'zip' | 'files' = hasFile ? 'zip' : 'files';

    // 8) 파일 수집
    const entries: ParsedEntry[] = [];

    if (hasFile && fileEntry instanceof File) {
      const lower = fileEntry.name.toLowerCase();
      if (!lower.endsWith('.zip')) {
        return fail('file 모드는 .zip 만 지원합니다', 400);
      }
      if (fileEntry.size > maxZipMB * 1024 * 1024) {
        return fail(
          `zip 파일 크기 한도(${maxZipMB}MB)를 초과했습니다`,
          413,
          { limit: maxZipMB * 1024 * 1024, received: fileEntry.size },
        );
      }
      const buf = await fileEntry.arrayBuffer();
      const zipMod = await import('jszip');
      const JSZip = (zipMod as { default?: typeof import('jszip') }).default ?? zipMod;
      let zip: import('jszip');
      try {
        zip = await (JSZip as unknown as typeof import('jszip')).loadAsync(buf);
      } catch (e) {
        return fail(`zip 파일 해석 실패: ${(e as Error).message}`, 400);
      }
      const files = Object.values(zip.files).filter((f) => !f.dir);
      if (files.length === 0) return fail('zip 이 비어 있습니다', 400);

      // wrapping 디렉터리 제거: 모든 파일이 동일한 첫 segment 로 시작하면 그 segment 를 제거
      const normalizedNames = files.map((f) => normalizePath(f.name));
      const wrappingDir = detectWrappingDir(normalizedNames);

      for (const f of files) {
        // 사용자 노출용 원본 경로 (정규화만 수행, wrapping strip 제외) — 계약 v1.1
        const originalPath = normalizePath(f.name);
        if (!originalPath) continue;

        const norm = originalPath;
        const stripped = wrappingDir
          ? norm.slice(wrappingDir.length + 1)
          : norm;
        if (!stripped) continue;

        const mappedSegs = stripped.split('/').filter(Boolean);
        const lowerName = stripped.toLowerCase();
        if (lowerName.endsWith('.zip')) {
          entries.push(makeFailedEntry(originalPath, mappedSegs, 'zip 안의 zip 은 지원하지 않습니다'));
          continue;
        }
        if (!lowerName.endsWith('.md')) {
          // 비-md 파일은 무시 (errors X) — 계약 §처리흐름 7
          continue;
        }
        const text = await f.async('string');
        if (text.length > maxFileKB * 1024) {
          entries.push(
            makeFailedEntry(
              originalPath,
              mappedSegs,
              `파일 크기 한도(${maxFileKB}KB)를 초과했습니다 (실제: ${(text.length / 1024).toFixed(0)}KB)`,
            ),
          );
          continue;
        }
        entries.push(parseEntry(originalPath, mappedSegs, text));
      }
    } else {
      // 다중 .md 모드 (preserveFolders 무시 — 계약 §스키마)
      for (const f of filesEntries) {
        const originalPath = f.name; // 원본 그대로 노출 (브라우저 File.name)
        const baseSeg = stripFolders(f.name);
        const mappedSegs = [baseSeg];
        if (!f.name.toLowerCase().endsWith('.md')) {
          entries.push(makeFailedEntry(originalPath, mappedSegs, '확장자가 .md 가 아닙니다'));
          continue;
        }
        if (f.size > maxFileKB * 1024) {
          entries.push(
            makeFailedEntry(
              originalPath,
              mappedSegs,
              `파일 크기 한도(${maxFileKB}KB)를 초과했습니다 (실제: ${(f.size / 1024).toFixed(0)}KB)`,
            ),
          );
          continue;
        }
        const text = await f.text();
        entries.push(parseEntry(originalPath, mappedSegs, text));
      }
    }

    if (entries.length === 0) return fail('처리할 .md 파일이 없습니다', 400);
    if (entries.length > maxFiles) {
      return fail(`한 번에 처리할 파일 수 한도(${maxFiles}개)를 초과했습니다`, 400, {
        limit: maxFiles,
        received: entries.length,
      });
    }

    // 9) 트랜잭션
    // 계약 §summary: created 는 신규+덮어쓰기+리네임 모두 합산. action 별 분포는 details[].action 으로 구분.
    const details: DetailRow[] = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;
    let foldersCreated = 0;

    await prisma.$transaction(
      async (tx) => {
        // 폴더 캐시: `${parentId ?? 'ROOT'}::${title}` → treeNodeId
        const folderCache = new Map<string, string>();

        const ensureFolder = async (
          parentId: string | null,
          rawTitle: string,
        ): Promise<string> => {
          const cleanTitle = sanitizeTitle(rawTitle) || 'untitled';
          const cacheKey = `${parentId ?? 'ROOT'}::${cleanTitle}`;
          const cached = folderCache.get(cacheKey);
          if (cached) return cached;

          const existing = await tx.treeNode.findFirst({
            where: { parentId, title: cleanTitle, type: 'folder' },
            select: { id: true },
          });
          if (existing) {
            folderCache.set(cacheKey, existing.id);
            return existing.id;
          }

          const maxOrder = await tx.treeNode.aggregate({
            where: { parentId },
            _max: { order: true },
          });
          const node = await tx.treeNode.create({
            data: {
              parentId,
              type: 'folder',
              title: cleanTitle,
              order: (maxOrder._max.order ?? -1) + 1,
            },
          });
          folderCache.set(cacheKey, node.id);
          foldersCreated += 1;
          return node.id;
        };

        for (const entry of entries) {
          if (entry.parseError) {
            failed += 1;
            details.push({ path: entry.originalPath, action: 'failed', reason: entry.parseError });
            continue;
          }

          // 9a) 디렉터리 → 폴더 노드 (preserveFolders=true & zip 모드만)
          // mappedSegs = wrapping strip 후의 segments (트리 매핑용). originalPath 와 별개.
          const segs = entry.mappedSegs;
          const filename = segs[segs.length - 1] ?? entry.originalPath;
          const dirSegs = segs.slice(0, -1);

          let parentId: string | null = targetParentId;
          if (mode === 'zip' && meta.preserveFolders) {
            for (const seg of dirSegs) {
              parentId = await ensureFolder(parentId, seg);
            }
          }

          // 9b) 페이지 제목
          const baseName = filename.replace(/\.md$/i, '');
          let title = sanitizeTitle(entry.meta.title || baseName) || 'untitled';

          // 9c) 충돌 검사
          const existing = await tx.treeNode.findFirst({
            where: { parentId, title, type: 'page' },
            select: {
              id: true,
              page: { select: { id: true, editSessions: { select: { editorName: true, expiresAt: true } } } },
            },
          });

          if (existing) {
            if (meta.conflictPolicy === 'skip') {
              skipped += 1;
              details.push({
                path: entry.originalPath,
                action: 'skipped',
                pageId: existing.page?.id,
                title,
                reason: '동일 제목의 페이지가 이미 존재합니다',
              });
              continue;
            }
            if (meta.conflictPolicy === 'overwrite') {
              if (!existing.page) {
                failed += 1;
                details.push({
                  path: entry.originalPath,
                  action: 'failed',
                  reason: '기존 노드에 Page 본문이 없습니다',
                });
                continue;
              }
              const lock = existing.page.editSessions[0];
              if (lock && lock.editorName !== actor && lock.expiresAt > new Date()) {
                skipped += 1;
                details.push({
                  path: entry.originalPath,
                  action: 'skipped',
                  pageId: existing.page.id,
                  title,
                  reason: `${lock.editorName}님이 편집 중이라 덮어쓸 수 없습니다`,
                });
                continue;
              }
              const cur = await tx.page.findUnique({
                where: { id: existing.page.id },
                select: { contentMarkdown: true, contentJson: true, authorName: true },
              });
              if (cur) {
                const lastVer = await tx.pageVersion.findFirst({
                  where: { pageId: existing.page.id },
                  orderBy: { versionNo: 'desc' },
                  select: { versionNo: true },
                });
                await tx.pageVersion.create({
                  data: {
                    pageId: existing.page.id,
                    versionNo: (lastVer?.versionNo ?? 0) + 1,
                    contentMarkdown: cur.contentMarkdown,
                    contentJson: cur.contentJson ?? Prisma.DbNull,
                    summary: `Import overwrite by ${actor}`,
                    authorName: cur.authorName,
                  },
                });
              }
              const updated = await tx.page.update({
                where: { id: existing.page.id },
                data: {
                  contentMarkdown: entry.content,
                  status: entry.meta.status ?? defaultStatus,
                },
              });
              const tagsApplied = await applyTags(tx, updated.id, entry.meta.tags);
              created += 1;
              details.push({
                path: entry.originalPath,
                action: 'overwritten',
                pageId: updated.id,
                title,
                tagsApplied,
              });
              continue;
            }
            // rename
            const candidate = await uniqueTitle(tx, parentId, title);
            if (!candidate) {
              failed += 1;
              details.push({
                path: entry.originalPath,
                action: 'failed',
                reason: `rename 시도 ${RENAME_MAX_SUFFIX}회 모두 충돌`,
              });
              continue;
            }
            title = candidate;
            const node = await createPageNode(
              tx,
              parentId,
              title,
              entry,
              defaultAuthor,
              defaultStatus,
            );
            const tagsApplied = await applyTags(tx, node.pageId, entry.meta.tags);
            created += 1;
            details.push({
              path: entry.originalPath,
              action: 'renamed',
              pageId: node.pageId,
              title,
              tagsApplied,
            });
            continue;
          }

          // 신규 생성
          const node = await createPageNode(
            tx,
            parentId,
            title,
            entry,
            defaultAuthor,
            defaultStatus,
          );
          const tagsApplied = await applyTags(tx, node.pageId, entry.meta.tags);
          created += 1;
          details.push({
            path: entry.originalPath,
            action: 'created',
            pageId: node.pageId,
            title,
            tagsApplied,
          });
        }
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    // 10) 감사 로그 (트랜잭션 외부, best-effort — NFR-304)
    await writeAuditSafe({
      entity: 'Import',
      entityId: meta.targetNodeId || 'ROOT',
      action: 'create',
      actor,
      after: {
        mode,
        targetNodeId: meta.targetNodeId,
        targetTitle,
        conflictPolicy: meta.conflictPolicy,
        preserveFolders: meta.preserveFolders,
        summary: { created, skipped, failed, foldersCreated },
        total: entries.length,
      },
    });

    return ok({
      summary: { created, skipped, failed, foldersCreated },
      details,
      targetNodeId: meta.targetNodeId,
      mode,
    });
  } catch (err) {
    if (err instanceof Error) {
      return fail(`Import 트랜잭션 실패: ${err.message}`, 500);
    }
    return handleError(err);
  }
}

// ============================================================================
// helpers
// ============================================================================

function numEnv(key: string, def: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

function makeFailedEntry(originalPath: string, mappedSegs: string[], reason: string): ParsedEntry {
  return {
    originalPath,
    mappedSegs,
    content: '',
    meta: { title: null, author: null, status: null, tags: [] },
    parseError: reason,
  };
}

function parseEntry(
  originalPath: string,
  mappedSegs: string[],
  raw: string,
): ParsedEntry {
  let parsed: { data: Record<string, unknown>; content: string };
  try {
    const m = matter(raw);
    parsed = { data: (m.data ?? {}) as Record<string, unknown>, content: m.content ?? '' };
  } catch {
    // 깨진 frontmatter — 본문은 원문 그대로 사용
    parsed = { data: {}, content: raw };
  }

  const data = parsed.data;
  const titleVal = typeof data.title === 'string' ? data.title.trim() : '';
  const authorVal = typeof data.author === 'string' ? data.author.trim() : '';
  const statusVal =
    typeof data.status === 'string' &&
    (VALID_STATUSES as readonly string[]).includes(data.status)
      ? (data.status as PageStatus)
      : null;
  // tags: array of strings 또는 단일 string 도 허용
  let tagsVal: string[] = [];
  if (Array.isArray(data.tags)) {
    tagsVal = (data.tags as unknown[])
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim())
      .filter(Boolean);
  } else if (typeof data.tags === 'string' && data.tags.trim()) {
    tagsVal = [data.tags.trim()];
  }

  return {
    originalPath,
    mappedSegs,
    content: parsed.content,
    meta: {
      title: titleVal || null,
      author: authorVal || null,
      status: statusVal,
      tags: tagsVal,
    },
  };
}

function sanitizeTitle(s: string): string {
  return s
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 200);
}

function normalizePath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .split('/')
    .filter((seg) => seg && seg !== '..' && seg !== '.')
    .join('/');
}

function stripFolders(name: string): string {
  // 다중 파일 모드에서 브라우저가 디렉터리 정보를 포함해 보낸 경우 제거
  return name.split(/[\\/]/).pop() ?? name;
}

function detectWrappingDir(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const first = paths[0].split('/')[0];
  if (!first) return null;
  for (const p of paths) {
    const segs = p.split('/');
    // 모든 파일이 같은 첫 segment 로 시작 + 첫 segment 만 있는 파일은 제외
    if (segs.length < 2 || segs[0] !== first) return null;
  }
  return first;
}

async function uniqueTitle(
  tx: Prisma.TransactionClient,
  parentId: string | null,
  base: string,
): Promise<string | null> {
  for (let n = 2; n <= RENAME_MAX_SUFFIX; n += 1) {
    const candidate = `${base}-${n}`;
    const exists = await tx.treeNode.findFirst({
      where: { parentId, title: candidate, type: 'page' },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  return null;
}

async function createPageNode(
  tx: Prisma.TransactionClient,
  parentId: string | null,
  title: string,
  entry: ParsedEntry,
  defaultAuthor: string,
  defaultStatus: PageStatus,
): Promise<{ treeNodeId: string; pageId: string }> {
  const maxOrder = await tx.treeNode.aggregate({
    where: { parentId },
    _max: { order: true },
  });
  const node = await tx.treeNode.create({
    data: {
      parentId,
      type: 'page',
      title,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
  const page = await tx.page.create({
    data: {
      treeNodeId: node.id,
      contentMarkdown: entry.content,
      authorName: entry.meta.author || defaultAuthor,
      status: entry.meta.status ?? defaultStatus,
    },
  });
  return { treeNodeId: node.id, pageId: page.id };
}

async function applyTags(
  tx: Prisma.TransactionClient,
  pageId: string,
  tagNames: string[],
): Promise<string[]> {
  const applied: string[] = [];
  for (const raw of tagNames) {
    const name = raw.trim();
    if (!name) continue;
    const tag = await tx.tag.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    await tx.pageTag.upsert({
      where: { pageId_tagId: { pageId, tagId: tag.id } },
      create: { pageId, tagId: tag.id },
      update: {},
    });
    applied.push(name);
  }
  return applied;
}
