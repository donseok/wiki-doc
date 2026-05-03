/**
 * 칸반 보드 — 도메인 상수 및 유틸리티
 * FR-601~608
 */

export const KANBAN_COLUMNS = ['Idea', 'Discussing', 'Pending', 'Resolved'] as const;
export type KanbanColumn = (typeof KANBAN_COLUMNS)[number];

export const COLUMN_LABEL: Record<KanbanColumn, string> = {
  Idea: '아이디어',
  Discussing: '논의 중',
  Pending: '보류',
  Resolved: '완료',
};

/** FR-604 카드 색상 프리셋 — Tailwind 색상 토큰 */
export interface CardColor {
  key: string;
  label: string;
  bg: string;
  border: string;
  fg: string;
}

export const CARD_COLORS: CardColor[] = [
  { key: 'default', label: '기본', bg: 'bg-card', border: 'border-border', fg: 'text-foreground' },
  { key: 'yellow', label: '노랑', bg: 'bg-yellow-50 dark:bg-yellow-950/40', border: 'border-yellow-300 dark:border-yellow-800', fg: 'text-yellow-900 dark:text-yellow-100' },
  { key: 'blue',   label: '파랑', bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-300 dark:border-blue-800', fg: 'text-blue-900 dark:text-blue-100' },
  { key: 'green',  label: '초록', bg: 'bg-green-50 dark:bg-green-950/40', border: 'border-green-300 dark:border-green-800', fg: 'text-green-900 dark:text-green-100' },
  { key: 'pink',   label: '핑크', bg: 'bg-pink-50 dark:bg-pink-950/40', border: 'border-pink-300 dark:border-pink-800', fg: 'text-pink-900 dark:text-pink-100' },
  { key: 'purple', label: '보라', bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-300 dark:border-purple-800', fg: 'text-purple-900 dark:text-purple-100' },
  { key: 'red',    label: '빨강', bg: 'bg-red-50 dark:bg-red-950/40', border: 'border-red-300 dark:border-red-800', fg: 'text-red-900 dark:text-red-100' },
];

export function colorByKey(key: string | null | undefined): CardColor {
  return CARD_COLORS.find((c) => c.key === key) ?? CARD_COLORS[0];
}

export interface KanbanCardData {
  id: string;
  boardId: string;
  column: string;
  title: string;
  body: string | null;
  color: string | null;
  order: number;
  authorName: string;
  linkedPageId: string | null;
  createdAt: string;
  updatedAt: string;
}
