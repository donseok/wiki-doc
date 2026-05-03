'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, BellRing, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface NotificationItem {
  id: string;
  recipient: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const POLL_MS = 15_000;

/**
 * FR-901~903 알림 벨.
 * - 15초 폴링으로 미읽음 알림 수 표시
 * - 클릭 시 popover 로 최근 10건 + 일괄 읽음 처리
 */
export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok && json.data && Array.isArray(json.data.items)) {
        setItems(json.data.items.slice(0, 10));
      }
    } catch {
      // 무시 — 폴링 다음 사이클에서 재시도
    }
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, []);

  // popover 열 때마다 즉시 갱신
  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  const unread = items.filter((n) => !n.readAt).length;

  const markAllRead = async () => {
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'readAll' }),
    });
    if (res.ok) await refresh();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="알림" className="relative">
          {unread > 0 ? (
            <BellRing className="h-5 w-5 text-amber-500" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">알림</span>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
                <Check className="h-3 w-3" /> 모두 읽음
              </Button>
            )}
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link href="/notifications">전체 보기</Link>
            </Button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            새 알림이 없습니다
          </div>
        ) : (
          <ul className="max-h-[340px] divide-y overflow-y-auto">
            {items.map((n) => {
              const message = (n.payload.message as string) || `[${n.type}]`;
              const pageId = n.payload.pageId as string | undefined;
              const inner = (
                <div className="flex flex-col gap-0.5 px-3 py-2 text-sm">
                  <span className="line-clamp-2">{message}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
              );
              return (
                <li
                  key={n.id}
                  className={!n.readAt ? 'bg-accent/40 hover:bg-accent' : 'hover:bg-accent/40'}
                >
                  {pageId ? (
                    <Link href={`/pages/${pageId}`} onClick={() => setOpen(false)}>
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
