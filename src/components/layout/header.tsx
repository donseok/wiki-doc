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
  const [searchFocused, setSearchFocused] = useState(false);
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
      <header className="glass sticky top-0 z-40 flex h-14 items-center justify-between border-b px-4">
        {/* Logo */}
        <Link
          href="/dashboard"
          aria-label="아틀라스 — 사내 시스템 지식의 지도"
          className="flex items-center gap-2.5 font-semibold transition-opacity hover:opacity-80"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <BookOpen className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight">Atlas</span>
            <span className="hidden text-[10px] font-normal text-muted-foreground sm:block">
              사내 시스템 지식의 지도
            </span>
          </div>
        </Link>

        {/* Search */}
        <form onSubmit={submit} className="mx-6 flex max-w-xl flex-1 items-center">
          <div className={`relative w-full transition-all duration-200 ${searchFocused ? 'scale-[1.01]' : ''}`}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="문서·코멘트·태그 검색"
              className={`h-9 w-full rounded-xl border bg-muted/40 pl-9 pr-20 text-sm placeholder:text-muted-foreground/50 transition-all duration-200 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 ${searchFocused ? 'shadow-glow' : ''}`}
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 select-none items-center gap-0.5 rounded-md border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:flex">
              Ctrl K
            </kbd>
          </div>
        </form>

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShortcutsOpen(true)}
                aria-label="단축키 도움말"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>단축키 (Ctrl+/)</TooltipContent>
          </Tooltip>

          <NotificationBell />

          <ThemeToggle />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon" aria-label="설정" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground">
                <Link href="/settings">
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>설정</TooltipContent>
          </Tooltip>
        </div>

        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </header>
    </TooltipProvider>
  );
}
