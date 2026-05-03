'use client';

/**
 * Excel/CSV 미리보기 — FR-1107
 *
 * - SheetJS(xlsx) 를 동적 import 로 지연 로드
 * - 시트 탭으로 시트 전환, 첫 시트의 상위 100행만 표시
 * - 다운로드 버튼 제공
 */

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROW_LIMIT = 100;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  filename: string;
}

interface SheetData {
  name: string;
  rows: (string | number | boolean | null)[][];
  totalRows: number;
}

export function ExcelPreviewDialog({ open, onOpenChange, url, filename }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSheets([]);

    (async () => {
      try {
        const [{ read, utils }, res] = await Promise.all([
          import('xlsx'),
          fetch(url, { cache: 'no-store' }),
        ]);
        if (!res.ok) throw new Error(`다운로드 실패 (HTTP ${res.status})`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        const wb = read(buf, { type: 'array' });
        const list: SheetData[] = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          const all = utils.sheet_to_json<(string | number | boolean | null)[]>(ws, {
            header: 1,
            defval: null,
            blankrows: false,
          });
          return {
            name,
            rows: all.slice(0, ROW_LIMIT),
            totalRows: all.length,
          };
        });

        if (cancelled) return;
        setSheets(list);
        setActiveSheet(list[0]?.name ?? '');
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Excel 로드 실패');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, url]);

  const cur = sheets.find((s) => s.name === activeSheet) ?? sheets[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="truncate pr-8 text-base">{filename}</DialogTitle>
        </DialogHeader>

        {/* 툴바 */}
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/50 px-4 py-2">
          {sheets.length > 1 ? (
            <Tabs value={activeSheet} onValueChange={setActiveSheet}>
              <TabsList>
                {sheets.map((s) => (
                  <TabsTrigger key={s.name} value={s.name} className="text-xs">
                    {s.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : (
            <span className="text-xs text-muted-foreground">{cur?.name ?? '–'}</span>
          )}

          <span className="ml-2 text-xs text-muted-foreground">
            {cur
              ? `${Math.min(cur.totalRows, ROW_LIMIT)} / ${cur.totalRows}행 표시`
              : ''}
          </span>

          <div className="ml-auto">
            <a
              href={url}
              download={filename}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border bg-background px-3 text-xs font-medium hover:bg-accent"
            >
              <Download className="h-3.5 w-3.5" />
              다운로드
            </a>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-auto bg-muted/30 p-3">
          {loading && (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              불러오는 중…
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-destructive">
              <AlertCircle className="h-6 w-6" />
              <span>{error}</span>
              <a href={url} download={filename} className="mt-2 text-primary underline">
                다운로드로 열기
              </a>
            </div>
          )}
          {!loading && !error && cur && (
            <div className="overflow-auto rounded-md border bg-card">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {cur.rows.length === 0 ? (
                    <tr>
                      <td className="p-4 text-center text-muted-foreground">
                        빈 시트입니다.
                      </td>
                    </tr>
                  ) : (
                    cur.rows.map((row, ri) => (
                      <tr
                        key={ri}
                        className={cn(
                          ri === 0 && 'bg-muted font-medium',
                          ri > 0 && 'odd:bg-background even:bg-muted/30',
                        )}
                      >
                        <td className="border-r border-border px-2 py-1 text-right text-muted-foreground">
                          {ri + 1}
                        </td>
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="max-w-[240px] truncate border-r border-border px-2 py-1"
                            title={String(cell ?? '')}
                          >
                            {formatCell(cell)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}
