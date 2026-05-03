'use client';

/**
 * 활동 피드 위젯 — FR-1006
 *
 * /api/dashboard/activity 에서 최근 30건의 활동을 가져와 시간순으로 표시.
 * 종류:
 *   - page_updated      페이지 본문 변경
 *   - page_status       페이지 상태 변경
 *   - comment           코멘트 신규
 *   - decision_status   Decision 상태 변경
 *   - action_done       Action Item 완료
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Activity as ActivityIcon,
  CheckCircle2,
  CircleDot,
  FileEdit,
  Loader2,
  MessageSquare,
  Scale,
} from 'lucide-react';

interface BaseEvent {
  id: string;
  when: string;
  actor: string | null;
  pageId?: string | null;
  pageTitle?: string | null;
}

type ActivityItem =
  | (BaseEvent & { kind: 'page_updated'; status: string })
  | (BaseEvent & {
      kind: 'page_status';
      fromStatus: string | null;
      toStatus: string;
    })
  | (BaseEvent & { kind: 'comment'; snippet: string })
  | (BaseEvent & {
      kind: 'decision_status';
      decisionId: string;
      decisionTitle: string;
      fromStatus: string | null;
      toStatus: string;
    })
  | (BaseEvent & { kind: 'action_done'; content: string });

interface Props {
  limit?: number;
}

function ActivityRowIcon({ kind }: { kind: ActivityItem['kind'] }) {
  const cls = 'h-3.5 w-3.5';
  switch (kind) {
    case 'page_updated':
      return <FileEdit className={cls} aria-hidden />;
    case 'page_status':
      return <CircleDot className={cls} aria-hidden />;
    case 'comment':
      return <MessageSquare className={cls} aria-hidden />;
    case 'decision_status':
      return <Scale className={cls} aria-hidden />;
    case 'action_done':
      return <CheckCircle2 className={cls} aria-hidden />;
  }
}

function describe(item: ActivityItem) {
  switch (item.kind) {
    case 'page_updated':
      return (
        <>
          페이지를 수정했습니다 ·{' '}
          <span className="text-muted-foreground">{item.status}</span>
        </>
      );
    case 'page_status':
      return (
        <>
          상태를 <span className="font-medium">{item.fromStatus ?? '없음'}</span> →{' '}
          <span className="font-medium">{item.toStatus}</span> 로 변경했습니다
        </>
      );
    case 'comment':
      return (
        <>
          코멘트를 남겼습니다:{' '}
          <span className="text-muted-foreground">&quot;{item.snippet}&quot;</span>
        </>
      );
    case 'decision_status':
      return (
        <>
          Decision <span className="font-medium">{item.decisionTitle}</span> 상태를{' '}
          <span className="font-medium">{item.fromStatus ?? '없음'}</span> →{' '}
          <span className="font-medium">{item.toStatus}</span> 로 변경했습니다
        </>
      );
    case 'action_done':
      return (
        <>
          Action Item 을 완료했습니다:{' '}
          <span className="text-muted-foreground line-through">{item.content}</span>
        </>
      );
  }
}

export function ActivityFeed({ limit = 30 }: Props) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/activity?limit=${limit}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (json?.ok && Array.isArray(json.data?.items)) {
        setItems(json.data.items as ActivityItem[]);
      } else {
        setItems([]);
        if (!json?.ok) {
          setError(json?.error ?? '활동 데이터를 불러오지 못했습니다.');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      className="rounded-lg border bg-card p-4 shadow-sm"
      aria-labelledby="activity-feed-title"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2
          id="activity-feed-title"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <ActivityIcon className="h-4 w-4" />
          활동 피드
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-muted-foreground hover:underline"
          disabled={loading}
        >
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 불러오는 중…
        </div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-rose-600">{error}</p>
      ) : !items || items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          최근 활동이 없습니다.
        </p>
      ) : (
        <ol className="divide-y">
          {items.map((it) => {
            const linkHref = it.pageId ? `/pages/${it.pageId}` : null;
            const dt = new Date(it.when);
            return (
              <li key={it.id} className="flex items-start gap-2 py-2 text-sm">
                <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
                  <ActivityRowIcon kind={it.kind} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="font-medium">{it.actor ?? '익명'}</span>
                    <span className="text-muted-foreground">
                      이(가) {linkHref && it.pageTitle ? (
                        <Link href={linkHref} className="hover:underline">
                          [{it.pageTitle}]
                        </Link>
                      ) : null}
                    </span>
                  </div>
                  <div className="text-xs leading-snug">{describe(it)}</div>
                  <div
                    className="mt-0.5 text-[11px] text-muted-foreground"
                    title={format(dt, 'yyyy-MM-dd HH:mm:ss')}
                  >
                    {formatDistanceToNow(dt, { addSuffix: true, locale: ko })}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
