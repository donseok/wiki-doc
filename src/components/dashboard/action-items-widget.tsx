'use client';

/**
 * Action Items 위젯 — FR-1007 (대시보드)
 *
 * 본인에게 멘션된 Action Items 만 노출하며, 완료 여부 토글 필터를 제공한다.
 * 클릭(체크박스)으로 즉시 완료 토글 → PATCH /api/action-items/[id].
 *
 * 위젯 자체는 Server-side에서 초기 데이터를 props 로 받지 않고, 마운트 시점에
 * 본인 사용자 기준으로 한 번 fetch 한다. (캐시 고려: 'no-store')
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { format, isPast } from 'date-fns';
import { CheckSquare, ListChecks, Loader2, ExternalLink } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/use-toast';

interface ActionItemRow {
  id: string;
  content: string;
  assignee: string | null;
  completed: boolean;
  completedAt: string | null;
  dueDate: string | null;
  pageId: string;
  page: { id: string; treeNode: { id: string; title: string } } | null;
}

interface Props {
  /** 현재 사용자 — 서버에서 getCurrentUserServer() 결과를 주입 */
  currentUser: string;
  /** 옵션: 한 번에 표시할 최대 건수 */
  limit?: number;
}

type Filter = 'incomplete' | 'completed' | 'all';

export function ActionItemsWidget({ currentUser, limit = 20 }: Props) {
  const [items, setItems] = useState<ActionItemRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('incomplete');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ assignee: currentUser });
      if (filter === 'incomplete') params.set('completed', 'false');
      if (filter === 'completed') params.set('completed', 'true');
      const res = await fetch(`/api/action-items?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (json?.ok && Array.isArray(json.data)) {
        setItems((json.data as ActionItemRow[]).slice(0, limit));
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser, filter, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggle = useCallback(
    async (item: ActionItemRow) => {
      setPendingId(item.id);
      const next = !item.completed;
      // 낙관적 업데이트
      setItems((prev) =>
        prev
          ? prev.map((i) =>
              i.id === item.id
                ? { ...i, completed: next, completedAt: next ? new Date().toISOString() : null }
                : i,
            )
          : prev,
      );
      try {
        const res = await fetch(`/api/action-items/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: next }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error ?? '갱신 실패');
        // 필터에 따라 목록에서 제거되어야 하면 다시 불러옴
        if (
          (filter === 'incomplete' && next) ||
          (filter === 'completed' && !next)
        ) {
          void load();
        }
      } catch (e) {
        // 롤백
        setItems((prev) =>
          prev
            ? prev.map((i) =>
                i.id === item.id
                  ? { ...i, completed: item.completed, completedAt: item.completedAt }
                  : i,
              )
            : prev,
        );
        toast({
          title: '상태 갱신 실패',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      } finally {
        setPendingId(null);
      }
    },
    [filter, load],
  );

  return (
    <section
      className="rounded-lg border bg-card p-4 shadow-sm"
      aria-labelledby="action-items-widget-title"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="action-items-widget-title"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <ListChecks className="h-4 w-4" />내 Action Items
          <span className="text-xs font-normal text-muted-foreground">@{currentUser}</span>
        </h2>
        <div
          role="tablist"
          aria-label="완료 여부 필터"
          className="flex items-center rounded-md border bg-background p-0.5 text-xs"
        >
          {(['incomplete', 'completed', 'all'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-0.5 transition-colors ${
                filter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              }`}
            >
              {f === 'incomplete' ? '미완료' : f === 'completed' ? '완료' : '전체'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 불러오는 중…
        </div>
      ) : !items || items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {filter === 'completed'
            ? '완료한 Action Item 이 없습니다.'
            : '본인에게 할당된 Action Item 이 없습니다.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => {
            const overdue =
              !it.completed && it.dueDate && isPast(new Date(it.dueDate));
            return (
              <li
                key={it.id}
                className="flex items-start gap-2 rounded-md border bg-background px-2.5 py-2 text-sm"
              >
                <div className="pt-0.5">
                  <Checkbox
                    checked={it.completed}
                    onCheckedChange={() => onToggle(it)}
                    disabled={pendingId === it.id}
                    aria-label={`완료 토글: ${it.content}`}
                  />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div
                    className={`truncate ${
                      it.completed ? 'text-muted-foreground line-through' : ''
                    }`}
                    title={it.content}
                  >
                    {it.content}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {it.dueDate && (
                      <span className={overdue ? 'font-semibold text-rose-600' : ''}>
                        ⏰ {format(new Date(it.dueDate), 'MM-dd')}
                        {overdue && ' (지남)'}
                      </span>
                    )}
                    {it.page?.treeNode && (
                      <Link
                        href={`/pages/${it.pageId}`}
                        className="inline-flex items-center gap-0.5 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {it.page.treeNode.title}
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex justify-end">
        <Link
          href="/action-items"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <CheckSquare className="h-3 w-3" /> 전체 보기 →
        </Link>
      </div>
    </section>
  );
}
