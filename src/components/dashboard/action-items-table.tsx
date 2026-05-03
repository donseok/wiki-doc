'use client';

/**
 * Action Items 일괄 처리 테이블 — FR-1007
 *
 *  - 좌측 체크박스로 다중 선택 → 일괄 완료/미완료 토글
 *  - 정렬: '미완료 우선 → 기한 빠른 순' 기본, 헤더 클릭으로 토글
 *  - 페이지 바로가기 컬럼 포함
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { format, isPast } from 'date-fns';
import { CheckSquare, Square, ExternalLink, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

export interface ActionItemRow {
  id: string;
  content: string;
  assignee: string | null;
  completed: boolean;
  completedAt: string | null;
  dueDate: string | null;
  pageId: string;
  page: { id: string; treeNode: { id: string; title: string } } | null;
  createdAt: string;
}

interface Props {
  initialItems: ActionItemRow[];
}

type SortKey = 'default' | 'dueDate' | 'assignee' | 'createdAt';

export function ActionItemsTable({ initialItems }: Props) {
  const [items, setItems] = useState<ActionItemRow[]>(initialItems);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>('default');
  const [working, setWorking] = useState(false);

  const sortedItems = useMemo(() => {
    const copy = [...items];
    switch (sort) {
      case 'dueDate':
        copy.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
        break;
      case 'assignee':
        copy.sort((a, b) => (a.assignee || '').localeCompare(b.assignee || ''));
        break;
      case 'createdAt':
        copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      default:
        copy.sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
        });
    }
    return copy;
  }, [items, sort]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === sortedItems.length ? new Set() : new Set(sortedItems.map((i) => i.id)),
    );
  }, [sortedItems]);

  /** 단건 완료 토글 */
  const toggleOne = useCallback(async (item: ActionItemRow) => {
    const next = !item.completed;
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, completed: next, completedAt: next ? new Date().toISOString() : null }
          : i,
      ),
    );
    try {
      const res = await fetch(`/api/action-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? '갱신 실패');
    } catch (e) {
      // 롤백
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, completed: item.completed, completedAt: item.completedAt }
            : i,
        ),
      );
      toast({
        title: '갱신 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  }, []);

  /** 일괄 완료/미완료 */
  const bulkSetCompleted = useCallback(
    async (next: boolean) => {
      if (selected.size === 0) return;
      setWorking(true);
      const ids = Array.from(selected);
      try {
        const results = await Promise.allSettled(
          ids.map((id) =>
            fetch(`/api/action-items/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ completed: next }),
            }).then(async (r) => {
              const j = await r.json().catch(() => null);
              if (!r.ok || !j?.ok) throw new Error(j?.error ?? `${id} 갱신 실패`);
              return id;
            }),
          ),
        );
        const successIds = new Set<string>(
          results
            .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
            .map((r) => r.value),
        );
        const failedCount = results.length - successIds.size;
        setItems((prev) =>
          prev.map((i) =>
            successIds.has(i.id)
              ? { ...i, completed: next, completedAt: next ? new Date().toISOString() : null }
              : i,
          ),
        );
        setSelected(new Set());
        toast({
          title: '일괄 처리 완료',
          description:
            failedCount > 0
              ? `${successIds.size}건 성공 / ${failedCount}건 실패`
              : `${successIds.size}건이 ${next ? '완료' : '미완료'} 상태로 변경되었습니다`,
          variant: failedCount > 0 ? 'destructive' : 'default',
        });
      } finally {
        setWorking(false);
      }
    },
    [selected],
  );

  const allChecked = sortedItems.length > 0 && selected.size === sortedItems.length;

  return (
    <section className="rounded-lg border bg-card shadow-sm">
      {/* 일괄 처리 바 */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={toggleSelectAll}
          disabled={sortedItems.length === 0}
        >
          {allChecked ? (
            <>
              <CheckSquare className="h-4 w-4" /> 전체 해제
            </>
          ) : (
            <>
              <Square className="h-4 w-4" /> 전체 선택
            </>
          )}
        </Button>
        <span className="text-xs text-muted-foreground">선택: {selected.size}건</span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={selected.size === 0 || working}
            onClick={() => bulkSetCompleted(true)}
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            일괄 완료
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={selected.size === 0 || working}
            onClick={() => bulkSetCompleted(false)}
          >
            일괄 미완료
          </Button>
        </div>
      </div>

      {/* 테이블 */}
      {sortedItems.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          조건에 해당하는 Action Item 이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2"></th>
                <th className="px-3 py-2 text-left font-medium">완료</th>
                <th className="px-3 py-2 text-left font-medium">내용</th>
                <th
                  className="cursor-pointer px-3 py-2 text-left font-medium hover:text-foreground"
                  onClick={() => setSort((s) => (s === 'assignee' ? 'default' : 'assignee'))}
                >
                  담당자
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-left font-medium hover:text-foreground"
                  onClick={() => setSort((s) => (s === 'dueDate' ? 'default' : 'dueDate'))}
                >
                  기한
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-left font-medium hover:text-foreground"
                  onClick={() => setSort((s) => (s === 'createdAt' ? 'default' : 'createdAt'))}
                >
                  생성일
                </th>
                <th className="px-3 py-2 text-left font-medium">페이지</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedItems.map((it) => {
                const overdue = !it.completed && it.dueDate && isPast(new Date(it.dueDate));
                return (
                  <tr key={it.id} className="hover:bg-accent/30">
                    <td className="px-3 py-2 align-top">
                      <Checkbox
                        checked={selected.has(it.id)}
                        onCheckedChange={() => toggleSelect(it.id)}
                        aria-label="선택"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Checkbox
                        checked={it.completed}
                        onCheckedChange={() => toggleOne(it)}
                        aria-label={`완료 토글: ${it.content}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className={it.completed ? 'text-muted-foreground line-through' : ''}>
                        {it.content}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {it.assignee ? `@${it.assignee}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {it.dueDate ? (
                        <span className={overdue ? 'font-semibold text-rose-600' : ''}>
                          {format(new Date(it.dueDate), 'yyyy-MM-dd')}
                          {overdue && ' (지남)'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {format(new Date(it.createdAt), 'MM-dd')}
                    </td>
                    <td className="px-3 py-2">
                      {it.page?.treeNode ? (
                        <Link
                          href={`/pages/${it.pageId}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {it.page.treeNode.title}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">(삭제됨)</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
