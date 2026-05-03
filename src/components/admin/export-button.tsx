'use client';

/**
 * AI Export 버튼 — FR-1009
 *
 * 드롭다운 메뉴로 다음 동작을 제공:
 *  - 전체 다운로드 (tree+pages+decisions+actionItems+comments+tags)
 *  - 페이지만 다운로드
 *  - Decision 만 다운로드
 *  - ActionItems 만 다운로드
 *  - 클립보드에 복사 (외부 AI 도구 — Claude/Cursor/ChatGPT — 즉시 붙여넣기용)
 *  - 미리보기 다이얼로그 (샘플 JSON + 활용 안내)
 *
 * 주의: 다운로드는 GET /api/export?include=...&download=1 호출이 트리거.
 * 클립보드는 download=0 응답을 navigator.clipboard.writeText 로 전달.
 */

import { useCallback, useState } from 'react';
import { Copy, Download, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { toastError } from '@/lib/toast-error';

type Scope = 'all' | 'pages' | 'decisions' | 'actionItems';

const SCOPE_INCLUDE: Record<Scope, string> = {
  all: 'tree,pages,decisions,actionItems,comments,tags',
  pages: 'tree,pages,tags',
  decisions: 'decisions',
  actionItems: 'actionItems',
};

const SCOPE_LABEL: Record<Scope, string> = {
  all: '전체',
  pages: '페이지만',
  decisions: 'Decision 만',
  actionItems: 'Action Items 만',
};

function buildUrl(scope: Scope, download: boolean): string {
  const params = new URLSearchParams({
    format: 'json',
    include: SCOPE_INCLUDE[scope],
  });
  if (download) params.set('download', '1');
  return `/api/export?${params.toString()}`;
}

export function ExportButton() {
  const [busy, setBusy] = useState<Scope | 'copy' | 'preview' | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewJson, setPreviewJson] = useState<string>('');

  const triggerDownload = useCallback((scope: Scope) => {
    // 직접 location 으로 GET 트리거 → 브라우저가 Content-Disposition 처리
    setBusy(scope);
    try {
      window.location.href = buildUrl(scope, true);
    } finally {
      // 즉시 해제 (브라우저가 다운로드를 처리하기 시작하면 페이지는 유지됨)
      setTimeout(() => setBusy(null), 800);
    }
  }, []);

  const copyToClipboard = useCallback(async (scope: Scope) => {
    setBusy('copy');
    try {
      const res = await fetch(buildUrl(scope, false), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        throw new Error('이 브라우저는 클립보드 API 를 지원하지 않습니다.');
      }
      await navigator.clipboard.writeText(text);
      toast({
        title: '클립보드에 복사됨',
        description: `${SCOPE_LABEL[scope]} JSON 을 외부 AI 도구에 붙여넣을 수 있습니다.`,
      });
    } catch (e) {
      toastError('복사 실패', e);
    } finally {
      setBusy(null);
    }
  }, []);

  const showPreview = useCallback(async () => {
    setBusy('preview');
    try {
      // 샘플 미리보기는 페이지만 + actionItems 정도로 가볍게
      const res = await fetch(buildUrl('pages', false), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // 페이지의 contentMarkdown 은 길어질 수 있으니 앞부분만 잘라 미리보기 압축
      const sample = (() => {
        if (!json || typeof json !== 'object') return json;
        const clone = { ...json } as Record<string, unknown>;
        if (Array.isArray(clone.pages)) {
          clone.pages = (clone.pages as Array<Record<string, unknown>>).slice(0, 2).map((p) => ({
            ...p,
            contentMarkdown:
              typeof p.contentMarkdown === 'string' && p.contentMarkdown.length > 200
                ? `${p.contentMarkdown.slice(0, 200)}…`
                : p.contentMarkdown,
          }));
        }
        if (Array.isArray(clone.tree)) {
          clone.tree = (clone.tree as Array<Record<string, unknown>>).slice(0, 5);
        }
        return clone;
      })();
      setPreviewJson(JSON.stringify(sample, null, 2));
      setPreviewOpen(true);
    } catch (e) {
      toastError('미리보기 실패', e);
    } finally {
      setBusy(null);
    }
  }, []);

  const isBusy = busy !== null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isBusy} aria-label="JSON 내보내기">
            {isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            JSON 내보내기 (FR-1009)
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>다운로드 범위</DropdownMenuLabel>
          {(Object.keys(SCOPE_INCLUDE) as Scope[]).map((scope) => (
            <DropdownMenuItem
              key={scope}
              onSelect={(e) => {
                e.preventDefault();
                triggerDownload(scope);
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              {SCOPE_LABEL[scope]} 다운로드
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>외부 AI 도구로 전달</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void copyToClipboard('all');
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            전체 JSON 클립보드 복사
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void copyToClipboard('pages');
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            페이지만 클립보드 복사
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void showPreview();
            }}
          >
            <Eye className="mr-2 h-4 w-4" />
            샘플 미리보기 / 활용 안내
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>JSON Export 미리보기</DialogTitle>
            <DialogDescription>
              아래 JSON 은 페이지만 포함한 샘플입니다. Claude Code, Cursor, ChatGPT 등
              외부 AI 도구에 붙여넣어 위키 데이터를 컨텍스트로 활용할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md bg-muted p-2 text-xs">
              <p className="mb-1 font-semibold">활용 예시</p>
              <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                <li>Claude Code: <code>/sc:load</code> 후 컨텍스트로 첨부</li>
                <li>Cursor: 첨부 파일로 끌어다 놓기 → 코드 생성</li>
                <li>ChatGPT: 메시지에 붙여넣고 &quot;이 위키를 요약&quot; 등 요청</li>
              </ul>
            </div>
            <pre
              className="max-h-[55vh] overflow-auto rounded-md border bg-background p-3 text-xs font-mono"
              aria-label="JSON 샘플"
            >
              {previewJson}
            </pre>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  void navigator.clipboard.writeText(previewJson).then(() => {
                    toast({ title: '샘플을 클립보드에 복사했습니다.' });
                  });
                }
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              샘플 복사
            </Button>
            <Button size="sm" onClick={() => setPreviewOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
