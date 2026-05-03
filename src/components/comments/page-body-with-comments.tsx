'use client';

/**
 * PageBodyWithComments — 페이지 뷰어용 본문 + 우측 코멘트 패널 레이아웃 (FR-501)
 *
 * - 데스크톱 (≥ lg): 본문(좌) + 코멘트 패널(우, 360px) 2-Column
 * - 모바일/좁은 화면: 우측 패널 토글 (오버레이)
 * - 본문 인라인 코멘트 마크 클릭 → 패널 자동 오픈 + 해당 코멘트로 스크롤
 * - 패널 코멘트의 인용 클릭 → 본문의 해당 마크로 스크롤
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CommentPanel, PANEL_OPEN_EVENT } from './comment-panel';

interface Props {
  pageId: string;
  currentUser: string;
  children: React.ReactNode;
}

export function PageBodyWithComments({ pageId, currentUser, children }: Props) {
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 본문에서 인라인 마크 클릭 → 모바일 패널 자동 오픈
  useEffect(() => {
    const onOpen = () => setMobileOpen(true);
    window.addEventListener(PANEL_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(PANEL_OPEN_EVENT, onOpen);
  }, []);

  // 패널의 인용 블록 클릭 → 본문 내 [data-comment-id="..."] 으로 스크롤 + 임시 강조
  const onAnchorClick = useCallback((commentId: string) => {
    const el = bodyRef.current?.querySelector<HTMLElement>(
      `[data-comment-id="${CSS.escape(commentId)}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-primary', 'ring-offset-1');
    window.setTimeout(
      () => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-1'),
      1500,
    );
  }, []);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div ref={bodyRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-6">{children}</div>
      </div>

      {/* 데스크톱: 우측 고정 패널 */}
      <div className="hidden w-[360px] shrink-0 lg:block">
        <CommentPanel
          pageId={pageId}
          currentUser={currentUser}
          onAnchorClick={onAnchorClick}
          onOpenCountChange={setOpenCount}
          className="h-full"
        />
      </div>

      {/* 모바일: 토글 버튼 (우하단 고정) */}
      <Button
        size="icon"
        className="fixed bottom-4 right-4 z-30 h-12 w-12 rounded-full shadow-lg lg:hidden"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="코멘트 토글"
        title="코멘트"
      >
        <MessageSquare className="h-5 w-5" />
        {openCount !== null && openCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {openCount}
          </span>
        )}
      </Button>

      {/* 모바일: 슬라이드 패널 */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-40 w-[90vw] max-w-md transform bg-background shadow-2xl transition-transform lg:hidden',
          mobileOpen ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!mobileOpen}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">코멘트</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setMobileOpen(false)}
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            {mobileOpen && (
              <CommentPanel
                pageId={pageId}
                currentUser={currentUser}
                onAnchorClick={onAnchorClick}
                onOpenCountChange={setOpenCount}
                className="h-full border-l-0"
              />
            )}
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
    </div>
  );
}
