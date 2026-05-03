'use client';
import Link from 'next/link';
import { Search, Settings, BookOpen, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { NotificationBell } from '@/components/layout/notification-bell';
import { ShortcutsDialog } from '@/components/layout/shortcuts-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

export function Header() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  // NFR-404: Ctrl+K → 검색 포커스, Ctrl+/ → 단축키 도움말
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (key === '/') {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <header className="flex h-14 items-center justify-between border-b bg-card px-4 shadow-sm">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <BookOpen className="h-5 w-5 text-primary" />
          <span>PI Wiki</span>
          <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">
            MES/APS PI 지식 허브
          </span>
        </Link>

        <form onSubmit={submit} className="mx-4 flex max-w-xl flex-1 items-center">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="문서·코멘트·태그 검색  (Ctrl+K)"
              className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </form>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShortcutsOpen(true)}
                aria-label="단축키 도움말"
              >
                <Keyboard className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>단축키 (Ctrl+/)</TooltipContent>
          </Tooltip>

          <NotificationBell />

          <ThemeToggle />

          <Button asChild variant="ghost" size="icon" aria-label="설정">
            <Link href="/settings">
              <Settings className="h-5 w-5" />
            </Link>
          </Button>
        </div>

        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </header>
    </TooltipProvider>
  );
}
