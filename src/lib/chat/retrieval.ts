import 'server-only';

import { prisma } from '@/lib/db';
import { searchVectorChunks } from '@/lib/chat/page-index';
import { searchPages } from '@/lib/search';

export interface ChatSource {
  pageId: string;
  treeNodeId: string;
  title: string;
  status: string;
  updatedAt: string;
  heading?: string | null;
  snippet: string;
  url: string;
  matchType: 'current' | 'vector' | 'title' | 'body' | 'tag' | 'attachment';
  score?: number;
}

export interface ChatContextDocument extends ChatSource {
  content: string;
}

export interface ChatContext {
  documents: ChatContextDocument[];
  sources: ChatSource[];
}

interface RetrieveChatContextInput {
  message: string;
  pageId?: string | null;
  space?: string | null;
  limit?: number;
  maxContextChars?: number;
}

const DEFAULT_LIMIT = 8;
const DEFAULT_MAX_CONTEXT_CHARS = Number(process.env.MAX_CHAT_CONTEXT_CHARS || 16000);
const CURRENT_PAGE_MAX_CHARS = 6000;
const SEARCH_HIT_MAX_CHARS = 2600;
const SOURCE_SNIPPET_MAX_CHARS = 260;

export async function retrieveChatContext(input: RetrieveChatContextInput): Promise<ChatContext> {
  const message = input.message.trim();
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), 12);
  const maxContextChars = Math.max(input.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS, 4000);
  const documents: ChatContextDocument[] = [];
  const seenPageIds = new Set<string>();

  if (input.pageId) {
    const current = await prisma.page.findUnique({
      where: { id: input.pageId },
      select: {
        id: true,
        treeNodeId: true,
        contentMarkdown: true,
        status: true,
        updatedAt: true,
        treeNode: { select: { title: true } },
      },
    });

    if (current) {
      documents.push({
        pageId: current.id,
        treeNodeId: current.treeNodeId,
        title: current.treeNode.title,
        status: current.status,
        updatedAt: current.updatedAt.toISOString(),
        snippet: makeSnippet(current.contentMarkdown, message, SOURCE_SNIPPET_MAX_CHARS),
        content: trimForContext(current.contentMarkdown, message, CURRENT_PAGE_MAX_CHARS),
        url: `/pages/${current.id}`,
        matchType: 'current',
      });
      seenPageIds.add(current.id);
    }
  }

  const vectorHits = message
    ? await searchVectorChunks(message, {
        space: input.space,
        limit,
      }).catch((err) => {
        console.warn('[Chat] vector search failed; falling back to FTS', err);
        return [];
      })
    : [];

  for (const hit of vectorHits) {
    if (seenPageIds.has(hit.pageId)) continue;
    documents.push({
      pageId: hit.pageId,
      treeNodeId: hit.treeNodeId,
      title: hit.title,
      heading: hit.heading,
      status: hit.status,
      updatedAt: hit.updatedAt.toISOString(),
      snippet: makeSnippet(hit.content, message, SOURCE_SNIPPET_MAX_CHARS),
      content: hit.content,
      url: `/pages/${hit.pageId}`,
      matchType: 'vector',
      score: hit.score,
    });
    seenPageIds.add(hit.pageId);
  }

  const hits = message
    ? await searchPages({
        q: message,
        space: input.space ?? undefined,
        sort: 'relevance',
        limit,
      })
    : [];

  const hitPageIds = hits.map((hit) => hit.pageId).filter((id) => !seenPageIds.has(id));
  if (hitPageIds.length > 0) {
    const pages = await prisma.page.findMany({
      where: { id: { in: hitPageIds } },
      select: {
        id: true,
        treeNodeId: true,
        contentMarkdown: true,
        status: true,
        updatedAt: true,
        treeNode: { select: { title: true } },
      },
    });
    const pageById = new Map(pages.map((page) => [page.id, page]));

    for (const hit of hits) {
      if (seenPageIds.has(hit.pageId)) continue;
      const page = pageById.get(hit.pageId);
      if (!page) continue;

      documents.push({
        pageId: page.id,
        treeNodeId: page.treeNodeId,
        title: page.treeNode.title,
        status: page.status,
        updatedAt: page.updatedAt.toISOString(),
        snippet: hit.snippet || makeSnippet(page.contentMarkdown, message, SOURCE_SNIPPET_MAX_CHARS),
        content: trimForContext(page.contentMarkdown, message, SEARCH_HIT_MAX_CHARS),
        url: `/pages/${page.id}`,
        matchType: hit.matchType,
        score: hit.score,
      });
      seenPageIds.add(page.id);
    }
  }

  const bounded = boundDocuments(documents, maxContextChars);
  return {
    documents: bounded,
    sources: bounded.map(({ content: _content, ...source }) => source),
  };
}

function boundDocuments(documents: ChatContextDocument[], maxChars: number): ChatContextDocument[] {
  let remaining = maxChars;
  const result: ChatContextDocument[] = [];

  for (const doc of documents) {
    if (remaining <= 0) break;
    const content = truncate(doc.content, remaining);
    remaining -= content.length;
    result.push({ ...doc, content });
  }

  return result;
}

function trimForContext(content: string, query: string, maxChars: number): string {
  const normalized = content.trim();
  if (normalized.length <= maxChars) return normalized;
  if (!query.trim()) return truncate(normalized, maxChars);

  const idx = normalized.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return truncate(normalized, maxChars);

  const half = Math.floor(maxChars / 2);
  const start = Math.max(0, idx - half);
  const end = Math.min(normalized.length, start + maxChars);
  return `${start > 0 ? '... ' : ''}${normalized.slice(start, end)}${
    end < normalized.length ? ' ...' : ''
  }`;
}

function makeSnippet(content: string, query: string, maxChars: number): string {
  return trimForContext(content, query, maxChars).replace(/\s+/g, ' ');
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 4)).trimEnd()} ...`;
}
