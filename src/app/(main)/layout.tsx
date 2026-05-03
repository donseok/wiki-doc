import type { ReactNode } from 'react';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatPanel } from '@/components/chat/chat-panel';

/**
 * 메인 3-Column 레이아웃 (요구사항 §7.1)
 *  - 좌측 사이드바 260px (검색 / 즐겨찾기 / 트리 / 최근)
 *  - 메인 콘텐츠 (가변)
 *  - 우측 패널 320px (필요 시 페이지에서 children prop으로 주입)
 */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col bg-background">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-background/50">
            <div className="animate-fade-in">{children}</div>
          </main>
          <ChatPanel />
        </div>
      </div>
    </TooltipProvider>
  );
}
