/**
 * 관리자 일괄 내보내기 — NFR-204
 *
 * GET /api/admin/export?format=json
 *   → 전체 데이터(트리/페이지/태그/Decision/ActionItem/Comment/Board/Card)를 단일 JSON 으로 반환.
 *
 * GET /api/admin/export?format=markdown
 *   → 페이지를 zip 으로 묶어 반환. zip 안 구조: `{tree-path}/{title}.md`
 *   → jszip 미존재 시 단일 .md concat 으로 fallback (Content-Type: text/markdown).
 *
 * 기존 /api/export 는 AI 친화 export(FR-1009) 용도이며 시그니처 유지. 본 라우트는 별도.
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { fail, handleError } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/current-user';
import { writeAuditSafe } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERSION = '1.0';

export async function GET(req: NextRequest) {
  try {
    // TODO(NFR-303): admin role check
    const actor = getCurrentUserServer();
    const u = new URL(req.url);
    const format = (u.searchParams.get('format') ?? 'json').toLowerCase();

    if (format === 'json') {
      return jsonExport(actor);
    }
    if (format === 'markdown') {
      return markdownExport(actor);
    }

    return fail('지원하지 않는 포맷', 400);
  } catch (err) {
    return handleError(err);
  }
}

async function jsonExport(actor: string) {
  const [tree, pages, decisions, actionItems, comments, tags, boards, cards] = await Promise.all([
    prisma.treeNode.findMany({
      orderBy: [{ parentId: 'asc' }, { order: 'asc' }],
      select: {
        id: true,
        parentId: true,
        type: true,
        title: true,
        order: true,
        icon: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.page.findMany({
      select: {
        id: true,
        treeNodeId: true,
        status: true,
        authorName: true,
        contentMarkdown: true,
        contentJson: true,
        pendingReason: true,
        createdAt: true,
        updatedAt: true,
        treeNode: { select: { title: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.decision.findMany({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.actionItem.findMany({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.comment.findMany({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tag.findMany({
      select: { id: true, name: true, color: true, createdAt: true },
      orderBy: { name: 'asc' },
    }),
    prisma.board.findMany({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.card.findMany({
      orderBy: [{ boardId: 'asc' }, { column: 'asc' }, { order: 'asc' }],
    }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: actor,
    version: VERSION,
    schema: 'pi-wiki-admin-export',
    counts: {
      tree: tree.length,
      pages: pages.length,
      decisions: decisions.length,
      actionItems: actionItems.length,
      comments: comments.length,
      tags: tags.length,
      boards: boards.length,
      cards: cards.length,
    },
    tree,
    pages: pages.map((p) => ({
      id: p.id,
      treeNodeId: p.treeNodeId,
      title: p.treeNode.title,
      status: p.status,
      author: p.authorName,
      pendingReason: p.pendingReason,
      tags: p.tags.map((pt) => pt.tag.name),
      contentMarkdown: p.contentMarkdown,
      contentJson: p.contentJson,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    decisions,
    actionItems,
    comments,
    tags,
    boards,
    cards,
  };

  await writeAuditSafe({
    entity: 'Admin',
    entityId: 'export',
    action: 'export-json',
    after: { counts: payload.counts },
    actor,
  });

  const ts = formatTimestampForFilename(new Date());
  const filename = `pi-wiki-export-${ts}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

interface TreeRow {
  id: string;
  parentId: string | null;
  type: 'folder' | 'page' | 'whiteboard';
  title: string;
}

interface PageRow {
  id: string;
  treeNodeId: string;
  title: string;
  contentMarkdown: string;
  status: string;
  author: string;
  tags: string[];
  updatedAt: Date;
}

async function markdownExport(actor: string) {
  const [treeNodes, pages] = await Promise.all([
    prisma.treeNode.findMany({
      orderBy: [{ parentId: 'asc' }, { order: 'asc' }],
      select: {
        id: true,
        parentId: true,
        type: true,
        title: true,
      },
    }),
    prisma.page.findMany({
      select: {
        id: true,
        treeNodeId: true,
        contentMarkdown: true,
        status: true,
        authorName: true,
        updatedAt: true,
        treeNode: { select: { title: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  // 트리 경로 계산
  const nodeMap = new Map<string, TreeRow>();
  treeNodes.forEach((n) =>
    nodeMap.set(n.id, {
      id: n.id,
      parentId: n.parentId,
      type: n.type as 'folder' | 'page' | 'whiteboard',
      title: n.title,
    }),
  );

  function pathFor(nodeId: string): string[] {
    const out: string[] = [];
    let cur: TreeRow | undefined = nodeMap.get(nodeId);
    let safety = 0;
    while (cur && safety < 64) {
      out.unshift(sanitizePathSegment(cur.title));
      cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined;
      safety += 1;
    }
    return out;
  }

  const pageRows: PageRow[] = pages.map((p) => ({
    id: p.id,
    treeNodeId: p.treeNodeId,
    title: p.treeNode.title,
    contentMarkdown: p.contentMarkdown,
    status: p.status,
    author: p.authorName,
    tags: p.tags.map((pt) => pt.tag.name),
    updatedAt: p.updatedAt,
  }));

  const ts = formatTimestampForFilename(new Date());

  await writeAuditSafe({
    entity: 'Admin',
    entityId: 'export',
    action: 'export-markdown',
    after: { pageCount: pageRows.length },
    actor,
  });

  // jszip 동적 import + 실패 시 단일 .md concat 으로 fallback
  try {
    const jszipMod = await import('jszip');
    const JSZip = (jszipMod as { default?: unknown }).default ?? jszipMod;
    const zip = new (JSZip as new () => InstanceType<typeof import('jszip')>)();
    const seen = new Map<string, number>();

    for (const p of pageRows) {
      const segs = pathFor(p.treeNodeId);
      const dir = segs.slice(0, -1).join('/');
      const baseName = sanitizePathSegment(p.title) || `page-${p.id}`;
      const fullBase = dir ? `${dir}/${baseName}` : baseName;
      const dedupKey = fullBase.toLowerCase();
      const seq = seen.get(dedupKey) ?? 0;
      seen.set(dedupKey, seq + 1);
      const finalPath = seq === 0 ? `${fullBase}.md` : `${fullBase} (${seq + 1}).md`;
      zip.file(finalPath, buildMarkdownDocument(p));
    }

    // 인덱스 파일
    const indexLines: string[] = [
      '# PI Wiki Markdown Export',
      '',
      `생성일: ${new Date().toISOString()}`,
      `생성자: ${actor}`,
      `페이지 수: ${pageRows.length}`,
      '',
      '## 페이지 목록',
      '',
      ...pageRows.map((p) => {
        const path = pathFor(p.treeNodeId).join(' / ');
        return `- ${path} (${p.status})`;
      }),
    ];
    zip.file('INDEX.md', indexLines.join('\n'));

    const ab = await zip.generateAsync({ type: 'arraybuffer' });
    return new Response(ab, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="pi-wiki-markdown-${ts}.zip"`,
      },
    });
  } catch {
    // Fallback: 단일 .md concat
    const parts: string[] = [
      `# PI Wiki Markdown Export\n`,
      `생성일: ${new Date().toISOString()}\n`,
      `생성자: ${actor}\n`,
      `페이지 수: ${pageRows.length}\n`,
      `\n---\n`,
    ];
    for (const p of pageRows) {
      const path = pathFor(p.treeNodeId).join(' / ');
      parts.push(`\n\n# ${path}\n\n`);
      parts.push(buildMarkdownDocument(p));
      parts.push(`\n\n---\n`);
    }
    return new Response(parts.join(''), {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="pi-wiki-markdown-${ts}.md"`,
      },
    });
  }
}

function buildMarkdownDocument(p: PageRow): string {
  const fm = [
    '---',
    `title: "${escapeYaml(p.title)}"`,
    `status: ${p.status}`,
    `author: "${escapeYaml(p.author)}"`,
    `updatedAt: ${p.updatedAt.toISOString()}`,
    `tags: [${p.tags.map((t) => `"${escapeYaml(t)}"`).join(', ')}]`,
    `id: ${p.id}`,
    '---',
    '',
    `# ${p.title}`,
    '',
  ].join('\n');
  return fm + (p.contentMarkdown ?? '');
}

function escapeYaml(s: string): string {
  return s.replace(/"/g, '\\"');
}

function sanitizePathSegment(s: string): string {
  // Windows/유닉스 양쪽에서 안전한 파일명: <>:"/\\|?* 제거, 양끝 공백/점 제거
  const cleaned = s
    .replace(/[<>:"/\\|?* -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return cleaned.slice(0, 80) || 'untitled';
}

function formatTimestampForFilename(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
