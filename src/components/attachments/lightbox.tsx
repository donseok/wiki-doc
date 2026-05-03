'use client';

/**
 * 이미지 라이트박스 — FR-1102
 *
 * - 모달로 이미지 확대 표시
 * - ESC 또는 배경 클릭으로 닫기
 * - ←/→ 키 또는 좌우 버튼으로 페이지 내 이미지 순회
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface LightboxImage {
  src: string;
  alt?: string;
  /** 다운로드 URL (없으면 src 사용) */
  downloadUrl?: string;
  /** 표시용 파일명 */
  filename?: string;
}

interface Props {
  images: LightboxImage[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Lightbox({ images, initialIndex = 0, open, onOpenChange }: Props) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(Math.max(0, Math.min(initialIndex, images.length - 1)));
  }, [open, initialIndex, images.length]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const prev = useCallback(
    () => setIndex((i) => (i - 1 + images.length) % images.length),
    [images.length],
  );
  const next = useCallback(() => setIndex((i) => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, prev, next]);

  if (!open || images.length === 0) return null;
  const cur = images[index];
  const dl = cur.downloadUrl ?? cur.src;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="이미지 확대 보기"
    >
      <div
        className="relative max-h-full max-w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cur.src}
          alt={cur.alt ?? ''}
          className="max-h-[90vh] max-w-[92vw] rounded-md object-contain shadow-2xl"
        />
      </div>

      {/* 상단 툴바 */}
      <div
        className="absolute right-3 top-3 flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={dl}
          download={cur.filename}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-white/10 px-3 text-sm text-white backdrop-blur hover:bg-white/20"
        >
          <Download className="h-4 w-4" />
          다운로드
        </a>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-white hover:bg-white/15 hover:text-white"
          onClick={close}
          aria-label="닫기"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* 좌우 네비게이션 */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur hover:bg-white/20',
            )}
            aria-label="이전 이미지"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur hover:bg-white/20',
            )}
            aria-label="다음 이미지"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
            {index + 1} / {images.length}
            {cur.filename && <span className="ml-2 opacity-80">· {cur.filename}</span>}
          </div>
        </>
      )}
    </div>
  );
}
