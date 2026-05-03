import 'server-only';

import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  generateEmbedding,
  generateEmbeddings,
  getOpenAIEmbeddingDimensions,
} from '@/lib/openai';
import { chunkMarkdown } from '@/lib/chat/chunking';

interface PageChunkInfrastructure {
  tableReady: boolean;
  vectorAvailable: boolean;
  hasVectorColumn: boolean;
}

export interface PageChunkIndexResult {
  pageId: string;
  chunks: number;
  embedded: number;
  skipped: boolean;
  reason?: string;
}

export interface VectorChunkHit {
  pageId: string;
  treeNodeId: string;
  title: string;
  heading: string | null;
  chunkIndex: number;
  content: string;
  status: string;
  updatedAt: Date;
  score: number;
}

let infrastructurePromise: Promise<PageChunkInfrastructure> | null = null;

export function schedulePageReindex(pageId: string): boolean {
  if (process.env.AI_AUTO_INDEX_ON_SAVE !== 'true') return false;

  void indexPageChunks(pageId).catch((err) => {
    console.warn('[ChatIndex] page reindex failed', err);
  });
  return true;
}

export async function ensurePageChunkInfrastructure(
  refresh = false,
): Promise<PageChunkInfrastructure> {
  if (!infrastructurePromise || refresh) {
    infrastructurePromise = setupPageChunkInfrastructure();
  }
  return infrastructurePromise;
}

export async function getPageChunkIndexStatus() {
  const infrastructure = await ensurePageChunkInfrastructure();
  const [totalRow] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "PageChunk"
  `;

  let embedded = BigInt(0);
  if (infrastructure.hasVectorColumn) {
    const [embeddedRow] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "PageChunk" WHERE embedding IS NOT NULL
    `;
    embedded = embeddedRow?.count ?? BigInt(0);
  }

  return {
    ...infrastructure,
    chunks: Number(totalRow?.count ?? BigInt(0)),
    embedded: Number(embedded),
  };
}

export async function indexPageChunks(pageId: string): Promise<PageChunkIndexResult> {
  const infrastructure = await ensurePageChunkInfrastructure();
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      treeNodeId: true,
      contentMarkdown: true,
      treeNode: { select: { title: true } },
    },
  });

  if (!page) {
    throw new Error('페이지를 찾을 수 없습니다');
  }

  const chunks = chunkMarkdown({
    title: page.treeNode.title,
    markdown: page.contentMarkdown,
  });

  if (chunks.length === 0) {
    await prisma.$executeRaw`DELETE FROM "PageChunk" WHERE "pageId" = ${page.id}`;
    return { pageId: page.id, chunks: 0, embedded: 0, skipped: false };
  }

  const hashes = chunks.map((chunk) => hashChunk(page.treeNode.title, chunk.heading, chunk.content));
  const existing = await prisma.$queryRaw<{ chunkIndex: number; contentHash: string }[]>`
    SELECT "chunkIndex", "contentHash"
    FROM "PageChunk"
    WHERE "pageId" = ${page.id}
    ORDER BY "chunkIndex" ASC
  `;

  const unchanged =
    existing.length === hashes.length &&
    existing.every((row, index) => row.chunkIndex === index && row.contentHash === hashes[index]);

  if (unchanged) {
    return { pageId: page.id, chunks: chunks.length, embedded: 0, skipped: true };
  }

  const canEmbed = Boolean(process.env.OPENAI_API_KEY) && infrastructure.hasVectorColumn;
  const embeddings = canEmbed
    ? await generateEmbeddings(
        chunks.map((chunk) => [page.treeNode.title, chunk.heading, chunk.content].filter(Boolean).join('\n\n')),
      )
    : null;

  if (embeddings) {
    const expectedDimensions = getOpenAIEmbeddingDimensions();
    const invalid = embeddings.embeddings.find((embedding) => embedding.length !== expectedDimensions);
    if (invalid) {
      throw new Error(
        `Embedding dimension mismatch: expected ${expectedDimensions}, got ${invalid.length}`,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM "PageChunk" WHERE "pageId" = ${page.id}`;

    for (const chunk of chunks) {
      const id = `${page.id}:${chunk.chunkIndex}`;
      const contentHash = hashes[chunk.chunkIndex];
      const embedding = embeddings?.embeddings[chunk.chunkIndex];

      if (embedding && infrastructure.hasVectorColumn) {
        await tx.$executeRaw`
          INSERT INTO "PageChunk" (
            id, "pageId", "treeNodeId", title, heading, "chunkIndex",
            content, "contentHash", "tokenEstimate", embedding, "embeddedAt", "createdAt", "updatedAt"
          )
          VALUES (
            ${id}, ${page.id}, ${page.treeNodeId}, ${page.treeNode.title}, ${chunk.heading},
            ${chunk.chunkIndex}, ${chunk.content}, ${contentHash}, ${chunk.tokenEstimate},
            ${toVectorLiteral(embedding)}::vector, NOW(), NOW(), NOW()
          )
        `;
      } else {
        await tx.$executeRaw`
          INSERT INTO "PageChunk" (
            id, "pageId", "treeNodeId", title, heading, "chunkIndex",
            content, "contentHash", "tokenEstimate", "embeddedAt", "createdAt", "updatedAt"
          )
          VALUES (
            ${id}, ${page.id}, ${page.treeNodeId}, ${page.treeNode.title}, ${chunk.heading},
            ${chunk.chunkIndex}, ${chunk.content}, ${contentHash}, ${chunk.tokenEstimate},
            NULL, NOW(), NOW()
          )
        `;
      }
    }
  });

  return {
    pageId: page.id,
    chunks: chunks.length,
    embedded: embeddings?.embeddings.length ?? 0,
    skipped: false,
    reason: canEmbed ? undefined : 'vector_or_api_key_unavailable',
  };
}

export async function reindexAllPages(limit = 200): Promise<PageChunkIndexResult[]> {
  const pages = await prisma.page.findMany({
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 1000),
  });

  const results: PageChunkIndexResult[] = [];
  for (const page of pages) {
    results.push(await indexPageChunks(page.id));
  }
  return results;
}

export async function searchVectorChunks(
  query: string,
  options: { limit?: number; space?: string | null } = {},
): Promise<VectorChunkHit[]> {
  const trimmed = query.trim();
  if (!trimmed || !process.env.OPENAI_API_KEY) return [];

  const infrastructure = await ensurePageChunkInfrastructure();
  if (!infrastructure.hasVectorColumn) return [];

  const embedding = await generateEmbedding(trimmed);
  const expectedDimensions = getOpenAIEmbeddingDimensions();
  if (embedding.length !== expectedDimensions) {
    throw new Error(`Embedding dimension mismatch: expected ${expectedDimensions}, got ${embedding.length}`);
  }

  const limit = Math.min(Math.max(options.limit ?? 8, 1), 20);
  const spaceFilter = options.space
    ? Prisma.sql`
      AND c."treeNodeId" IN (
        WITH RECURSIVE tree AS (
          SELECT id FROM "TreeNode" WHERE id = ${options.space}
          UNION ALL
          SELECT n.id FROM "TreeNode" n JOIN tree ON n."parentId" = tree.id
        )
        SELECT id FROM tree
      )
    `
    : Prisma.sql``;

  const rows = await prisma.$queryRaw<VectorChunkHit[]>`
    SELECT
      c."pageId",
      c."treeNodeId",
      c.title,
      c.heading,
      c."chunkIndex",
      c.content,
      p.status::text AS status,
      p."updatedAt",
      (1 - (c.embedding <=> ${toVectorLiteral(embedding)}::vector))::float8 AS score
    FROM "PageChunk" c
    JOIN "Page" p ON p.id = c."pageId"
    WHERE c.embedding IS NOT NULL
    ${spaceFilter}
    ORDER BY c.embedding <=> ${toVectorLiteral(embedding)}::vector
    LIMIT ${limit}
  `;

  return rows;
}

async function setupPageChunkInfrastructure(): Promise<PageChunkInfrastructure> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "PageChunk" (
      id TEXT NOT NULL,
      "pageId" TEXT NOT NULL,
      "treeNodeId" TEXT NOT NULL,
      title TEXT NOT NULL,
      heading TEXT,
      "chunkIndex" INTEGER NOT NULL,
      content TEXT NOT NULL,
      "contentHash" TEXT NOT NULL,
      "tokenEstimate" INTEGER NOT NULL DEFAULT 0,
      "embeddedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PageChunk_pkey" PRIMARY KEY (id),
      CONSTRAINT "PageChunk_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"(id) ON DELETE CASCADE,
      CONSTRAINT "PageChunk_pageId_chunkIndex_key" UNIQUE ("pageId", "chunkIndex")
    )
  `;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "PageChunk_pageId_idx" ON "PageChunk" ("pageId")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "PageChunk_treeNodeId_idx" ON "PageChunk" ("treeNodeId")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "PageChunk_contentHash_idx" ON "PageChunk" ("contentHash")`;

  let vectorAvailable = false;
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
    vectorAvailable = true;
  } catch {
    vectorAvailable = false;
  }

  let hasVectorColumn = false;
  if (vectorAvailable) {
    try {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "PageChunk" ADD COLUMN IF NOT EXISTS embedding vector(1536)',
      );
      hasVectorColumn = true;
    } catch {
      hasVectorColumn = false;
    }
  }

  if (hasVectorColumn) {
    try {
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "PageChunk_embedding_hnsw_idx" ON "PageChunk" USING hnsw (embedding vector_cosine_ops)',
      );
    } catch {
      try {
        await prisma.$executeRawUnsafe(
          'CREATE INDEX IF NOT EXISTS "PageChunk_embedding_ivfflat_idx" ON "PageChunk" USING ivfflat (embedding vector_cosine_ops)',
        );
      } catch {
        // 벡터 인덱스 생성 실패 시에도 순차 검색은 가능하다.
      }
    }
  }

  return {
    tableReady: true,
    vectorAvailable,
    hasVectorColumn,
  };
}

function hashChunk(title: string, heading: string | null, content: string): string {
  return createHash('sha256').update(`${title}\n${heading ?? ''}\n${content}`).digest('hex');
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.map((value) => (Number.isFinite(value) ? String(value) : '0')).join(',')}]`;
}
