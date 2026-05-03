/**
 * AI 친화 데이터 Export API — FR-1009
 *
 * GET /api/export?format=json&include=tree,pages,decisions,actionItems,comments,tags&space=<treeNodeId>
 *  - format: json (기본). markdown 은 추후 (NFR-204 데이터 내보내기 연계).
 *  - include: 부분 export 지원. 콤마 구분. 미지정 시 전체.
 *  - 외부 AI 도구(Claude Code, Cursor, ChatGPT 등) 가 위키 데이터를 한 번에 활용 가능하도록
 *    표준 스키마로 export.
 *
 * 응답 스키마 v1.3:
 * {
 *   exportedAt: ISO8601,
 *   version: "1.3",
 *   schema: "atlas-wiki-export",
 *   wiki: { name, url },
 *   counts: {...},
 *   tree:        TreeNode[],
 *   pages:       PageExport[],
 *   decisions:   Decision[],
 *   actionItems: ActionItem[],
 *   comments:    CommentExport[],
 *   tags:        Tag[]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERSION = '1.3';

const KNOWN_INCLUDES = ['tree', 'pages', 'decisions', 'actionItems', 'comments', 'tags'] as const;
type IncludeKey = (typeof KNOWN_INCLUDES)[number];

const querySchema = z.object({
  format: z.enum(['json']).optional().default('json'),
  include: z.string().optional(),
  download: z.string().optional(),
  space: z.string().optional(),
});

function parseInclude(raw: string | undefined): Set<IncludeKey> {
  if (!raw || raw.trim().length === 0) {
    return new Set<IncludeKey>(KNOWN_INCLUDES);
  }
  const wanted = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const result = new Set<IncludeKey>();
  for (const w of wanted) {
    if ((KNOWN_INCLUDES as readonly string[]).includes(w)) {
      result.add(w as IncludeKey);
    }
  }
  // 비어 있으면 전체로 안전하게 폴백
  if (result.size === 0) {
    KNOWN_INCLUDES.forEach((k) => result.add(k));
  }
  return result;
}

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const parsed = querySchema.parse({
      format: u.searchParams.get('format') ?? undefined,
      include: u.searchParams.get('include') ?? undefined,
      download: u.searchParams.get('download') ?? undefined,
      space: u.searchParams.get('space') ?? undefined,
    });

    const include = parseInclude(parsed.include);
    const wantDownload = parsed.download === '1' || parsed.download === 'true';

    const [tree, pages, decisions, actionItems, comments, tags] = await Promise.all([
      include.has('tree')
        ? prisma.treeNode.findMany({
            orderBy: [{ parentId: 'asc' }, { order: 'asc' }],
            select: {
              id: true,
              parentId: true,
              type: true,
              title: true,
              order: true,
              icon: true,
              createdAt: true,
            },
          })
        : Promise.resolve([] as Array<Record<string, unknown>>),
      include.has('pages')
        ? prisma.page.findMany({
            select: {
              id: true,
              treeNodeId: true,
              status: true,
              authorName: true,
              contentMarkdown: true,
              createdAt: true,
              updatedAt: true,
              treeNode: { select: { title: true } },
              tags: { select: { tag: { select: { name: true } } } },
            },
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve(
            [] as Array<{
              id: string;
              treeNodeId: string;
              status: string;
              authorName: string;
              contentMarkdown: string;
              createdAt: Date;
              updatedAt: Date;
              treeNode: { title: string };
              tags: Array<{ tag: { name: string } }>;
            }>,
          ),
      include.has('decisions')
        ? prisma.decision.findMany({
            select: {
              id: true,
              pageId: true,
              blockId: true,
              title: true,
              context: true,
              options: true,
              decision: true,
              rationale: true,
              owner: true,
              status: true,
              decidedAt: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([] as Array<Record<string, unknown>>),
      include.has('actionItems')
        ? prisma.actionItem.findMany({
            select: {
              id: true,
              pageId: true,
              blockId: true,
              content: true,
              assignee: true,
              dueDate: true,
              completed: true,
              completedAt: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([] as Array<Record<string, unknown>>),
      include.has('comments')
        ? prisma.comment.findMany({
            // 인라인 anchor 는 제외 — body + page 매핑만 export
            select: {
              id: true,
              pageId: true,
              parentId: true,
              body: true,
              authorName: true,
              resolved: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([] as Array<Record<string, unknown>>),
      include.has('tags')
        ? prisma.tag.findMany({
            select: { id: true, name: true, color: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([] as Array<Record<string, unknown>>),
    ]);

    const wikiName = process.env.WIKI_NAME?.trim() || 'Atlas';
    const wikiUrl = process.env.WIKI_BASE_URL?.trim() || u.origin;

    const payload = {
      exportedAt: new Date().toISOString(),
      version: VERSION,
      schema: 'atlas-wiki-export',
      wiki: { name: wikiName, url: wikiUrl },
      counts: {
        tree: tree.length,
        pages: pages.length,
        decisions: decisions.length,
        actionItems: actionItems.length,
        comments: comments.length,
        tags: tags.length,
      },
      ...(include.has('tree') && { tree }),
      ...(include.has('pages') && {
        pages: pages.map((p) => ({
          id: p.id,
          treeNodeId: p.treeNodeId,
          title: p.treeNode.title,
          status: p.status,
          authorName: p.authorName,
          tags: p.tags.map((pt) => pt.tag.name),
          contentMarkdown: p.contentMarkdown,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      }),
      ...(include.has('decisions') && { decisions }),
      ...(include.has('actionItems') && { actionItems }),
      ...(include.has('comments') && { comments }),
      ...(include.has('tags') && { tags }),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    };

    if (wantDownload) {
      const dateStr = new Date().toISOString().slice(0, 10);
      headers['Content-Disposition'] = `attachment; filename="atlas-wiki-export-${dateStr}.json"`;
    }

    return new NextResponse(JSON.stringify(payload, null, 2), { status: 200, headers });
  } catch (err) {
    return handleError(err);
  }
}
