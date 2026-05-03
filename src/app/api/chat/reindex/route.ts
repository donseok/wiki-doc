import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, handleError, ok, parseJson } from '@/lib/api';
import {
  getPageChunkIndexStatus,
  indexPageChunks,
  reindexAllPages,
} from '@/lib/chat/page-index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ReindexSchema = z.object({
  pageId: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

export async function GET() {
  try {
    return ok(await getPageChunkIndexStatus());
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, ReindexSchema);
    if (body.pageId) {
      const result = await indexPageChunks(body.pageId);
      return ok({ mode: 'page', result });
    }

    const results = await reindexAllPages(body.limit ?? 200);
    return ok({
      mode: 'all',
      count: results.length,
      chunks: results.reduce((sum, item) => sum + item.chunks, 0),
      embedded: results.reduce((sum, item) => sum + item.embedded, 0),
      skipped: results.filter((item) => item.skipped).length,
      results,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('OPENAI_API_KEY')) {
      return fail('OPENAI_API_KEY가 설정되어 있지 않습니다.', 503);
    }
    return handleError(err);
  }
}
