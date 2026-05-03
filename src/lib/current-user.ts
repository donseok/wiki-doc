import { headers } from 'next/headers';

/**
 * 현재 사용자 이름을 가져온다.
 * Sprint 1: 헤더 X-PI-User → 쿠키 → 환경변수 DEFAULT_USER_NAME 순.
 * 향후 NFR-502 (SSO) 도입 시 이 함수만 교체.
 */
export function getCurrentUserServer(): string {
  try {
    const h = headers();
    const userHeader = h.get('x-pi-user');
    if (userHeader && userHeader.trim().length > 0) {
      return userHeader.trim();
    }
    const cookie = h.get('cookie') || '';
    const match = cookie.match(/(?:^|;\s*)pi-wiki-user=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    // headers()가 사용 불가능한 컨텍스트
  }
  return process.env.DEFAULT_USER_NAME || '익명';
}
