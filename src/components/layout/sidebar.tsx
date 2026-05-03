'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Star, Clock, FolderTree, KanbanSquare, Tags, Plus, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { SortableTreeMenu } from '@/components/tree/sortable-tree-menu';
import { Input } from '@/components/ui/input';
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
    <aside className="flex w-[260px] shrink-0 flex-col border-r bg-card">
      <div className="space-y-2 p-3">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="트리 내 빠른 검색"
          className="h-8 text-sm"
        />
        <div className="grid grid-cols-3 gap-1">
          <Button asChild variant="outline" size="sm">
            <Link href="/boards" className="!gap-1 !px-2">
              <KanbanSquare className="h-3.5 w-3.5" />
              <span className="text-xs">보드</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/tags" className="!gap-1 !px-2">
              <Tags className="h-3.5 w-3.5" />
              <span className="text-xs">태그</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/watches" className="!gap-1 !px-2">
              <Bell className="h-3.5 w-3.5" />
              <span className="text-xs">구독</span>
            </Link>
          </Button>
        </div>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        {favorites.length > 0 && (
          <Section icon={<Star className="h-3.5 w-3.5" />} title="즐겨찾기">
            {favorites.map((f) => (
              <Link
                key={f.id}
                href={`/pages/${f.id}`}
                className="block truncate rounded px-2 py-1 text-sm hover:bg-accent"
              >
                {f.title}
              </Link>
            ))}
          </Section>
        )}

        {recent.length > 0 && (
          <Section icon={<Clock className="h-3.5 w-3.5" />} title="최근 본 글">
            {recent.slice(0, 7).map((r) => (
              <Link
                key={r.id}
                href={`/pages/${r.id}`}
                className="block truncate rounded px-2 py-1 text-sm hover:bg-accent"
              >
                {r.title}
              </Link>
            ))}
          </Section>
        )}

        <Section icon={<FolderTree className="h-3.5 w-3.5" />} title="문서 트리" defaultOpen>
          <SortableTreeMenu nodes={nodes} filter={filter} onChanged={refresh} />
        </Section>
      </ScrollArea>
    </aside>
  );
}

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
    <div className="px-2 py-2">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center gap-2 rounded px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent"
      >
        {icon}
        <span>{title}</span>
        <span className="ml-auto">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="mt-1 space-y-0.5">{children}</div>}
    </div>
  );
}
