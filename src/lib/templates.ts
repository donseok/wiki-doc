/**
 * FR-213 템플릿 변수 치환
 */

import { format } from 'date-fns';

export interface TemplateContext {
  date?: string;     // YYYY-MM-DD (기본: 오늘)
  author?: string;
  title?: string;
}

const VARIABLE_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

export function applyTemplateVariables(
  source: string,
  ctx: TemplateContext = {},
): string {
  const today = format(new Date(), 'yyyy-MM-dd');
  const values: Record<string, string> = {
    date: ctx.date ?? today,
    author: ctx.author ?? '익명',
    title: ctx.title ?? '제목 없음',
  };
  return source.replace(VARIABLE_PATTERN, (full, key) => {
    return values[key] ?? full;
  });
}

export function listTemplateVariables(source: string): string[] {
  const matches = source.matchAll(VARIABLE_PATTERN);
  return Array.from(new Set(Array.from(matches).map((m) => m[1])));
}
