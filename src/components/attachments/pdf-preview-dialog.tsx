'use client';

/**
 * PDF 인라인 미리보기 — FR-1106
 *
 * - pdfjs-dist v4 동적 import (초기 번들 영향 최소화)
 * - 워커 경로 우선순위:
 *     1) `pdfjs-dist/build/pdf.worker.mjs?url`  (Webpack 자산 처리)
 *     2) cdnjs CDN fallback
 * - 페이지 네비게이션, 다운로드 제공
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  AlertCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

const PDFJS_VERSION = '4.10.38';
const CDN_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  filename: string;
}

// pdfjs-dist 의 동적 타입 (any 회피용 최소 인터페이스)
type PDFDocumentProxy = {
  numPages: number;
  getPage: (n: number) => Promise<PDFPageProxy>;
  destroy: () => Promise<void>;
};
type PDFPageProxy = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel: () => void };
};

export function PdfPreviewDialog({ open, onOpenChange, url, filename }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);

  // PDF 문서 로드
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPageNum(1);
    setNumPages(0);

    (async () => {
      try {
        // 동적 import — 초기 번들 영향 최소화
        const pdfjs = await import('pdfjs-dist');

        // 워커 설정: 가능하면 번들된 워커, 실패 시 CDN
        try {
          // @ts-expect-error: ?url import 는 Next/Webpack 에 의해 string 으로 처리됨
          const workerMod = await import('pdfjs-dist/build/pdf.worker.mjs?url');
          const workerSrc =
            (typeof workerMod === 'string' ? workerMod : workerMod?.default) || CDN_WORKER;
          pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        } catch {
          // fallback to CDN
          pdfjs.GlobalWorkerOptions.workerSrc = CDN_WORKER;
        }

        const task = pdfjs.getDocument({ url });
        const pdf = (await task.promise) as unknown as PDFDocumentProxy;
        if (cancelled) {
          await pdf.destroy();
          return;
        }
        docRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'PDF 로드 실패');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      void docRef.current?.destroy();
      docRef.current = null;
    };
  }, [open, url]);

  // 페이지 렌더
  useEffect(() => {
    const pdf = docRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || numPages === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        renderTaskRef.current?.cancel();
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (e) {
        // RenderingCancelled 등은 무시
        if (e instanceof Error && /Cancelled|cancelled/.test(e.message)) return;
        if (!cancelled) setError(e instanceof Error ? e.message : 'PDF 렌더 실패');
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pageNum, scale, numPages]);

  const goPrev = useCallback(() => setPageNum((n) => Math.max(1, n - 1)), []);
  const goNext = useCallback(
    () => setPageNum((n) => Math.min(numPages || n, n + 1)),
    [numPages],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="truncate pr-8 text-base">{filename}</DialogTitle>
        </DialogHeader>

        {/* 툴바 */}
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/50 px-4 py-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            disabled={pageNum <= 1 || loading}
            aria-label="이전 페이지"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {numPages > 0 ? `${pageNum} / ${numPages}` : '–'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            disabled={pageNum >= numPages || loading}
            aria-label="다음 페이지"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <div className="mx-2 h-5 w-px bg-border" aria-hidden />

          <Button
            variant="outline"
            size="sm"
            onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(2)))}
            disabled={loading}
            aria-label="축소"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(2)))}
            disabled={loading}
            aria-label="확대"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>

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
        <div className="flex-1 overflow-auto bg-muted/30 p-4">
          {loading && (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              PDF 로드 중…
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
          {!loading && !error && (
            <div className="flex justify-center">
              <canvas ref={canvasRef} className="rounded-md bg-white shadow" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
