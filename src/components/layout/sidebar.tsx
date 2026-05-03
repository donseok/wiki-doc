'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Star,
  Clock,
  FolderTree,
  KanbanSquare,
  Tags,
  Bell,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SortableTreeMenu } from '@/components/tree/sortable-tree-menu';
import type { TreeNodeData } from '@/types';

export function Sidebar() {
  const [nodes, setNodes] = useState<TreeNodeData[]>([]);
  const [filter, setFilter] = useState('');
  const [recent, setRecent] = useState<{ id: string; title: string }[]>([]);
  const [favorites, setFavorites] = useState<{ id: string; title: string }[]>([]);

  const refresh = async () => {
    const res = await fetch('/api/tree', { cache: 'no-store' });
    const json = await res.json();
    if (json.ok) setNodes(json.data);
  };

  useEffect(() => {
    refresh();
    if (typeof window !== 'undefined') {
      const r = JSON.parse(localStorage.getItem('pi-wiki:recent') || '[]');
      const f = JSON.parse(localStorage.getItem('pi-wiki:favorites') || '[]');
      setRecent(r);
      setFavorites(f);
    }
  }, []);

  return (
    <aside className="glass-sidebar flex w-[260px] shrink-0 flex-col border-r">
      {/* Quick filter */}
      <div className="space-y-2.5 p-3">
        <div className="relative">
          <input
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

        {recent.length > 0 && (
          <Section icon={<Clock className="h-3 w-3 text-blue-500" />} title="최근 본 글">
            <div className="space-y-0.5">
              {recent.slice(0, 7).map((r) => (
                <Link
                  key={r.id}
                  href={`/pages/${r.id}`}
                  className="flex items-center gap-2 truncate rounded-lg px-2.5 py-1.5 text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-foreground"
                >
                  <Clock className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  <span className="truncate">{r.title}</span>
                </Link>
              ))}
            </div>
          </Section>
        )}

        <Section icon={<FolderTree className="h-3 w-3 text-primary/70" />} title="문서 트리" defaultOpen>
          <SortableTreeMenu nodes={nodes} filter={filter} onChanged={refresh} />
        </Section>
      </ScrollArea>
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
