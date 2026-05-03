import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

export function getCurrentUser(): string {
  // Sprint 1: 인증 미적용 — 환경변수 또는 쿠키에서 사용자명 가져오기
  // 향후 SSO 도입 시 이 함수만 교체하면 됨 (NFR-502)
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem('pi-wiki:user') || '익명';
  }
  return process.env.DEFAULT_USER_NAME || '익명';
}
