/**
 * 헬스 체크 — 운영 환경에서 컨테이너 health probe / 모니터링용.
 * 응답:
 *   200 { ok: true, db: 'up', version: '...' }
 *   503 { ok: false, db: 'down', error }
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      db: 'up',
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? '0.1.0',
      now: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        db: 'down',
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 503 },
    );
  }
}
