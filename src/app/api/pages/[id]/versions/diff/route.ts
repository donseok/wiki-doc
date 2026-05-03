/**
 * 두 버전 Diff — FR-403
 *
 * GET /api/pages/[id]/versions/diff?from=<versionId>&to=<versionId>
 *  &ignoreWhitespace=true&ignoreCase=true&collapse=3
 *
 * 큰 본문에서 클라이언트 계산 부담을 줄이기 위해 서버에서 미리 계산한다.
 * 결과: { from: VersionMeta, to: VersionMeta, lines: DiffLine[] }
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, fail, handleError } from '@/lib/api';
import { diffMarkdown } from '@/lib/diff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const u = new URL(req.url);
    const fromId = u.searchParams.get('from');
    const toId = u.searchParams.get('to');
    if (!fromId || !toId) return fail('from / to 버전 ID 가 필요합니다', 400);

    const ignoreWhitespace = u.searchParams.get('ignoreWhitespace') === 'true';
    const ignoreCase = u.searchParams.get('ignoreCase') === 'true';
    const collapseRaw = u.searchParams.get('collapse');
    const collapse = collapseRaw ? Number(collapseRaw) : 0;

    const [from, to] = await Promise.all([
      prisma.pageVersion.findFirst({ where: { id: fromId, pageId: params.id } }),
      prisma.pageVersion.findFirst({ where: { id: toId, pageId: params.id } }),
    ]);

    if (!from || !to) return fail('버전을 찾을 수 없습니다', 404);

    const lines = diffMarkdown(from.contentMarkdown, to.contentMarkdown, {
      ignoreWhitespace,
      ignoreCase,
      collapseUnchanged: Number.isFinite(collapse) && collapse > 0 ? collapse : 0,
    });

    return ok({
      from: {
        id: from.id,
        versionNo: from.versionNo,
        authorName: from.authorName,
        createdAt: from.createdAt,
        summary: from.summary,
        contentMarkdown: from.contentMarkdown,
      },
      to: {
        id: to.id,
        versionNo: to.versionNo,
        authorName: to.authorName,
        createdAt: to.createdAt,
        summary: to.summary,
        contentMarkdown: to.contentMarkdown,
      },
      lines,
    });
  } catch (err) {
    return handleError(err);
  }
}
