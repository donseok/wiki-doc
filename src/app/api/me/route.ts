/**
 * 현재 사용자 정보 조회 API.
 * Sprint 1: 인증 미적용 — 헤더/쿠키/환경변수 우선순위로 결정된 사용자명만 반환.
 * 향후 SSO 도입 시 이 엔드포인트가 풍부한 프로파일을 반환하도록 확장.
 */
import { ok, handleError } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const name = getCurrentUserServer();
    return ok({ name });
  } catch (err) {
    return handleError(err);
  }
}
