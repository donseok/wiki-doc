'use client';

/**
 * 두 버전의 마크다운 본문을 비교 표시 — FR-403 / FR-404
 *
 *  - unified 뷰 (좌·우 인라인): added=초록, removed=빨강, unchanged=중립
 *  - side-by-side 뷰 토글
 *  - 공백/대소문자 무시 옵션
 *  - 변경 통계 (+N / -N) 표시
 */

import { useMemo, useState } from 'react';
import { ArrowLeftRight, AlignJustify, Columns2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { diffMarkdown, diffStats, type DiffLine, type DiffOptions } from '@/lib/diff';

export interface VersionMeta {
  versionNo: number;
  authorName: string;
  createdAt: string;
  summary?: string | null;
}

interface Props {
  fromVersion: VersionMeta;
  toVersion: VersionMeta;
  fromMarkdown: string;
  toMarkdown: string;
  /** 미리 서버에서 계산된 결과를 받을 경우 사용 — 클라이언트 계산을 건너뜀 */
  precomputedLines?: DiffLine[];
}

type Mode = 'unified' | 'split';

export function VersionDiff({
  fromVersion,
  toVersion,
  fromMarkdown,
  toMarkdown,
  precomputedLines,
}: Props) {
  const [mode, setMode] = useState<Mode>('unified');
  const [ignoreWs, setIgnoreWs] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [collapse, setCollapse] = useState(true);

  const lines: DiffLine[] = useMemo(() => {
    if (precomputedLines && !ignoreWs && !ignoreCase && !collapse) {
      return precomputedLines;
    }
    const opts: DiffOptions = {
      ignoreWhitespace: ignoreWs,
      ignoreCase,
      collapseUnchanged: collapse ? 3 : 0,
    };
    return diffMarkdown(fromMarkdown, toMarkdown, opts);
  }, [fromMarkdown, toMarkdown, precomputedLines, ignoreWs, ignoreCase, collapse]);

  const stats = useMemo(() => diffStats(lines), [lines]);

  const isEmpty = lines.length === 0 || (stats.added === 0 && stats.removed === 0);

  return (
    <div className="space-y-3">
      {/* 헤더 — 비교 대상 + 통계 + 옵션 */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border bg-rose-50 px-2 py-0.5 font-mono text-xs text-rose-700">
            v{fromVersion.versionNo}
          </span>
          <span className="text-xs text-muted-foreground">@{fromVersion.authorName}</span>
          <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="rounded-md border bg-emerald-50 px-2 py-0.5 font-mono text-xs text-emerald-700">
            v{toVersion.versionNo}
          </span>
          <span className="text-xs text-muted-foreground">@{toVersion.authorName}</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
          <span className="font-mono">
            <span className="text-emerald-600">+{stats.added}</span>
            {' '}
            <span className="text-rose-600">-{stats.removed}</span>
          </span>
          <label className="inline-flex items-center gap-1.5">
            <Checkbox checked={ignoreWs} onCheckedChange={(v) => setIgnoreWs(!!v)} />
            <span>공백 무시</span>
          </label>
          <label className="inline-flex items-center gap-1.5">
            <Checkbox checked={ignoreCase} onCheckedChange={(v) => setIgnoreCase(!!v)} />
            <span>대소문자 무시</span>
          </label>
          <label className="inline-flex items-center gap-1.5">
            <Checkbox checked={collapse} onCheckedChange={(v) => setCollapse(!!v)} />
            <span>변경 외 축약</span>
          </label>
          <div className="flex items-center rounded-md border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setMode('unified')}
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-0.5',
                mode === 'unified' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
              aria-pressed={mode === 'unified'}
            >
              <AlignJustify className="h-3 w-3" /> 인라인
            </button>
            <button
              type="button"
              onClick={() => setMode('split')}
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-0.5',
                mode === 'split' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
              aria-pressed={mode === 'split'}
            >
              <Columns2 className="h-3 w-3" /> 좌우
            </button>
          </div>
        </div>
      </div>

      {/* 본문 — Diff */}
      {isEmpty ? (
        <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
          두 버전 사이에 변경이 없습니다.
        </div>
      ) : mode === 'unified' ? (
        <UnifiedDiff lines={lines} />
      ) : (
        <SplitDiff lines={lines} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Unified Diff (인라인)                                              */
/* ------------------------------------------------------------------ */

function UnifiedDiff({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full font-mono text-xs">
        <tbody>
          {lines.map((l, idx) => {
            if (l.type === 'context-skip') {
              return (
                <tr key={idx} className="bg-muted/30 text-muted-foreground">
                  <td className="select-none px-2 py-0.5 text-right" colSpan={2}>
                    …
                  </td>
                  <td className="px-2 py-0.5 italic">{l.line}</td>
                </tr>
              );
            }
            const cls =
              l.type === 'added'
                ? 'bg-emerald-50'
                : l.type === 'removed'
                ? 'bg-rose-50'
                : 'bg-background';
            const sign = l.type === 'added' ? '+' : l.type === 'removed' ? '-' : ' ';
            const signCls =
              l.type === 'added'
                ? 'text-emerald-600'
                : l.type === 'removed'
                ? 'text-rose-600'
                : 'text-muted-foreground';
            return (
              <tr key={idx} className={cls}>
                <td
                  className="select-none border-r px-2 py-0.5 text-right text-muted-foreground"
                  style={{ width: 50 }}
                >
                  {l.leftNo ?? ''}
                </td>
                <td
                  className="select-none border-r px-2 py-0.5 text-right text-muted-foreground"
                  style={{ width: 50 }}
                >
                  {l.rightNo ?? ''}
                </td>
                <td className="whitespace-pre-wrap break-words px-2 py-0.5">
                  <span className={cn('mr-1 select-none', signCls)}>{sign}</span>
                  {l.line || ' '}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Split Diff (좌우)                                                  */
/* ------------------------------------------------------------------ */

interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

function buildSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i];
    if (cur.type === 'context-skip') {
      rows.push({ left: cur, right: cur });
      i += 1;
      continue;
    }
    if (cur.type === 'unchanged') {
      rows.push({ left: cur, right: cur });
      i += 1;
      continue;
    }
    // removed 들과 added 들을 짝짓기
    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (i < lines.length && lines[i].type === 'removed') {
      removed.push(lines[i]);
      i += 1;
    }
    while (i < lines.length && lines[i].type === 'added') {
      added.push(lines[i]);
      i += 1;
    }
    const max = Math.max(removed.length, added.length);
    for (let k = 0; k < max; k++) {
      rows.push({ left: removed[k] ?? null, right: added[k] ?? null });
    }
  }
  return rows;
}

function SplitDiff({ lines }: { lines: DiffLine[] }) {
  const rows = useMemo(() => buildSplitRows(lines), [lines]);
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full font-mono text-xs">
        <thead>
          <tr className="border-b bg-muted/40 text-[11px] text-muted-foreground">
            <th className="px-2 py-1 text-left" colSpan={2}>이전 버전</th>
            <th className="px-2 py-1 text-left" colSpan={2}>새 버전</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            // skip rendering
            if (r.left?.type === 'context-skip' && r.right?.type === 'context-skip') {
              return (
                <tr key={idx} className="bg-muted/30 text-muted-foreground">
                  <td className="px-2 py-0.5 text-right" colSpan={2}>…</td>
                  <td className="px-2 py-0.5 italic" colSpan={2}>{r.left.line}</td>
                </tr>
              );
            }
            return (
              <tr key={idx} className="border-b last:border-0">
                <Cell side="left" line={r.left} />
                <Cell side="right" line={r.right} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ side, line }: { side: 'left' | 'right'; line: DiffLine | null }) {
  const isLeft = side === 'left';
  if (!line) {
    return (
      <>
        <td className="select-none border-r bg-muted/20 px-2 py-0.5" style={{ width: 50 }} />
        <td className="bg-muted/20 px-2 py-0.5" />
      </>
    );
  }
  let bg = 'bg-background';
  if (line.type === 'removed') bg = 'bg-rose-50';
  else if (line.type === 'added') bg = 'bg-emerald-50';

  const lineNo = isLeft ? line.leftNo : line.rightNo;
  return (
    <>
      <td
        className={cn(
          'select-none border-r px-2 py-0.5 text-right text-muted-foreground',
          bg,
        )}
        style={{ width: 50 }}
      >
        {lineNo ?? ''}
      </td>
      <td className={cn('whitespace-pre-wrap break-words px-2 py-0.5', bg)}>
        {line.line || ' '}
      </td>
    </>
  );
}
