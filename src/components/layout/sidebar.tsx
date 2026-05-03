'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Star,
  FolderTree,
  KanbanSquare,
  Tags,
  Bell,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SortableTreeMenu } from '@/components/tree/sortable-tree-menu';
import { cn } from '@/lib/utils';
import type { TreeNodeData } from '@/types';

const COLLAPSE_KEY = 'atlas-wiki:sidebar-collapsed';

function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const v = localStorage.getItem(COLLAPSE_KEY);
    if (v === '1') setCollapsed(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== 'b') return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setCollapsed((prev) => {
        const next = !prev;
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
        return next;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  };

  return { collapsed, toggle, setCollapsed };
}

export function Sidebar() {
  const [nodes, setNodes] = useState<TreeNodeData[]>([]);
  const [filter, setFilter] = useState('');
  const [favorites, setFavorites] = useState<{ id: string; title: string }[]>([]);
  const { collapsed, toggle, setCollapsed } = useSidebarCollapse();

  const refresh = async () => {
    const res = await fetch('/api/tree', { cache: 'no-store' });
    const json = await res.json();
    if (json.ok) setNodes(json.data);
  };

  useEffect(() => {
    refresh();
    if (typeof window !== 'undefined') {
      const f = JSON.parse(localStorage.getItem('pi-wiki:favorites') || '[]');
      setFavorites(f);
    }
  }, []);

  const expandAndFocusSearch = () => {
    setCollapsed(false);
    localStorage.setItem(COLLAPSE_KEY, '0');
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(
        'aside[data-sidebar="primary"] input[type="text"]',
      );
      input?.focus();
      input?.select();
    });
  };

  return (
    <aside
      data-sidebar="primary"
      data-collapsed={collapsed}
      className={cn(
        'glass-sidebar flex shrink-0 flex-col overflow-hidden border-r transition-[width] duration-200 ease-out',
        collapsed ? 'w-[56px]' : 'w-[260px]',
      )}
    >
      {!collapsed && (
        <div id="sidebar-content" className="flex min-h-0 flex-1 flex-col">
          {/* Quick filter */}
          <div className="space-y-2.5 p-3">
            <div className="relative">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="트리 검색..."
                className="h-8 w-full rounded-lg border-0 bg-background/60 px-3 text-xs placeholder:text-muted-foreground/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <NavLink href="/boards" icon={<KanbanSquare className="h-3.5 w-3.5" />} label="보드" />
              <NavLink href="/tags" icon={<Tags className="h-3.5 w-3.5" />} label="태그" />
              <NavLink href="/watches" icon={<Bell className="h-3.5 w-3.5" />} label="구독" />
            </div>
          </div>

          <div className="mx-3 h-px bg-border/50" />

          <ScrollArea className="flex-1">
            {favorites.length > 0 && (
              <Section icon={<Star className="h-3 w-3 text-amber-500" />} title="즐겨찾기">
                <div className="space-y-0.5">
                  {favorites.map((f) => (
                    <Link
                      key={f.id}
                      href={`/pages/${f.id}`}
                      className="flex items-center gap-2 truncate rounded-lg px-2.5 py-1.5 text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-foreground"
                    >
                      <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                      <span className="truncate">{f.title}</span>
                    </Link>
                  ))}
                </div>
              </Section>
            )}

            <Section icon={<FolderTree className="h-3 w-3 text-primary/70" />} title="문서 트리" defaultOpen>
              <SortableTreeMenu nodes={nodes} filter={filter} onChanged={refresh} />
            </Section>
          </ScrollArea>
        </div>
      )}

      {collapsed && (
        <div className="flex flex-1 flex-col items-center pt-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={expandAndFocusSearch}
                aria-label="검색 (펼치기)"
                className="h-9 w-9 rounded-lg text-muted-foreground/70 hover:bg-sidebar-accent hover:text-foreground"
              >
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">검색 (Ctrl+K)</TooltipContent>
          </Tooltip>
        </div>
      )}

      <div className="mt-auto border-t border-border/50 p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-controls="sidebar-content"
              aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
              className={cn(
                'h-8 rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
                collapsed ? 'w-9 mx-auto' : 'w-full',
              )}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? '사이드바 펼치기 (Ctrl+B)' : '사이드바 접기 (Ctrl+B)'}
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

/* ── Quick-nav pill button ── */
function NavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button asChild variant="ghost" size="sm" className="h-7 w-full justify-start gap-1.5 rounded-lg bg-background/50 px-2 text-[11px] font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-foreground">
      <Link href={href}>
        {icon}
        {label}
      </Link>
    </Button>
  );
}

/* ── Collapsible section ── */
function Section({
  icon,
  title,
  children,
  defaultOpen = true,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="px-2 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {icon}
        <span>{title}</span>
      </button>
      {open && <div className="mt-1 animate-fade-in">{children}</div>}
    </div>
  );
}
