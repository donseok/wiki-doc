'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';

interface Props {
  pageId: string;
  /** 페이지의 트리노드 ID — 폴더 단위 구독용 */
  treeNodeId?: string;
}

interface WatchEntry {
  id: string;
  pageId: string | null;
  treeNodeId: string | null;
  includeChildren: boolean;
}

/**
 * FR-905/906 Watch 구독 버튼.
 *  - 페이지 단독 구독
 *  - 폴더 단위 구독 + includeChildren
 *  - 구독 해제
 */
export function WatchButton({ pageId, treeNodeId }: Props) {
  const [watching, setWatching] = useState<WatchEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch('/api/watch', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) return;
      const list: WatchEntry[] = json.data;
      const found =
        list.find((w) => w.pageId === pageId) ||
        (treeNodeId ? list.find((w) => w.treeNodeId === treeNodeId) : null) ||
        null;
      setWatching(found);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, treeNodeId]);

  const subscribe = async (mode: 'page' | 'children') => {
    const body =
      mode === 'children' && treeNodeId
        ? { treeNodeId, includeChildren: true }
        : { pageId };
    const res = await fetch('/api/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast({
        title: mode === 'children' ? '폴더 구독 시작' : '구독 시작',
        description: '변경 사항이 알림으로 전달됩니다.',
      });
      void refresh();
    } else {
      const json = await res.json().catch(() => ({}));
      toast({
        title: '구독 실패',
        description: json?.error || '',
        variant: 'destructive',
      });
    }
  };

  const unsubscribe = async () => {
    if (!watching) return;
    const qs = watching.pageId
      ? `pageId=${encodeURIComponent(watching.pageId)}`
      : watching.treeNodeId
        ? `treeNodeId=${encodeURIComponent(watching.treeNodeId)}`
        : '';
    const res = await fetch(`/api/watch?${qs}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ title: '구독 해제' });
      setWatching(null);
    } else {
      toast({ title: '해제 실패', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <Bell className="h-4 w-4" />
      </Button>
    );
  }

  if (watching) {
    return (
      <Button variant="ghost" size="sm" onClick={unsubscribe} title="구독 해제 (FR-905)">
        <BellOff className="h-4 w-4 text-amber-500" />
        <span className="text-xs">구독 중</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" title="구독 (FR-905)">
          <BellPlus className="h-4 w-4" />
          <span className="text-xs">구독</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs">알림 받기</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => subscribe('page')}>
          <Bell className="h-3.5 w-3.5" /> 이 페이지만
        </DropdownMenuItem>
        {treeNodeId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => subscribe('children')}>
              <Bell className="h-3.5 w-3.5" /> 이 폴더 + 하위 전체 (FR-906)
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
