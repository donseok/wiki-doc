'use client';
import { useEffect } from 'react';

interface Props {
  pageId: string;
  title: string;
}

/** 최근 본 문서 트래킹 (FR-109) — 클라이언트 localStorage */
export function RecentTracker({ pageId, title }: Props) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const list: { id: string; title: string }[] = JSON.parse(
        localStorage.getItem('pi-wiki:recent') || '[]',
      );
      const next = [
        { id: pageId, title },
        ...list.filter((r) => r.id !== pageId),
      ].slice(0, 10);
      localStorage.setItem('pi-wiki:recent', JSON.stringify(next));
    } catch {
      // ignore
    }
  }, [pageId, title]);
  return null;
}
