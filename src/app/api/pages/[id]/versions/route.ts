import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, fail, handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET — 페이지 버전 이력 조회 (FR-402) */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const versions = await prisma.pageVersion.findMany({
      where: { pageId: params.id },
      orderBy: { versionNo: 'desc' },
      select: {
        id: true,
        versionNo: true,
        summary: true,
        authorName: true,
        createdAt: true,
        label: true,
      },
    });
    return ok(versions);
  } catch (err) {
    return handleError(err);
  }
}
