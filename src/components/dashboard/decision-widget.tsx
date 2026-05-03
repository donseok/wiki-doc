/**
 * Decision 모아보기 위젯 — FR-1008 (대시보드)
 *
 * 서버 컴포넌트로 동작. Prisma 직접 조회로 4개 상태별 카운트와
 * 최근 5건의 Decision (모든 상태 합쳐서) 을 보여준다.
 */

import Link from 'next/link';
import { Scale } from 'lucide-react';
import { format } from 'date-fns';
import { prisma } from '@/lib/db';
import type { DecisionStatus } from '@prisma/client';

const STATUS_ORDER: DecisionStatus[] = ['Proposed', 'Accepted', 'Rejected', 'Superseded'];

const STATUS_LABEL: Record<DecisionStatus, string> = {
  Proposed: '제안',
  Accepted: '수락',
  Rejected: '거절',
  Superseded: '대체됨',
};

const STATUS_TONE: Record<DecisionStatus, string> = {
  Proposed:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Accepted:
    'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  Rejected:
    'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  Superseded:
    'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400',
};

export async function DecisionWidget() {
  const [byStatus, recent] = await Promise.all([
    prisma.decision.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.decision.findMany({
      take: 5,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        owner: true,
        pageId: true,
        page: { select: { treeNode: { select: { id: true, title: true } } } },
      },
    }),
  ]);

  const counts = Object.fromEntries(
    byStatus.map((g) => [g.status as DecisionStatus, g._count._all]),
  ) as Partial<Record<DecisionStatus, number>>;

  return (
    <section
      className="rounded-lg border bg-card p-4 shadow-sm"
      aria-labelledby="decision-widget-title"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2
          id="decision-widget-title"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <Scale className="h-4 w-4" />
          Decision 모아보기
        </h2>
        <Link href="/decisions" className="text-xs text-muted-foreground hover:underline">
          전체 보기 →
        </Link>
      </div>

      <ul className="mb-3 grid grid-cols-2 gap-1.5" aria-label="Decision 상태별 건수">
        {STATUS_ORDER.map((s) => (
          <li
            key={s}
            className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-xs ${STATUS_TONE[s]}`}
          >
            <span>{STATUS_LABEL[s]}</span>
            <span className="font-semibold tabular-nums">{counts[s] ?? 0}</span>
          </li>
        ))}
      </ul>

      {recent.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          아직 등록된 Decision 이 없습니다.
        </p>
      ) : (
        <ul className="space-y-1">
          {recent.map((d) => (
            <li key={d.id} className="text-sm">
              <Link
                href={`/pages/${d.pageId}#decision-${d.id}`}
                className="block rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_TONE[d.status as DecisionStatus]}`}
                  >
                    {STATUS_LABEL[d.status as DecisionStatus]}
                  </span>
                  <span className="flex-1 truncate font-medium">{d.title}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {d.page?.treeNode.title ?? '(페이지 없음)'}
                  </span>
                  {d.owner && <span>· @{d.owner}</span>}
                  <span className="ml-auto shrink-0">
                    {format(d.updatedAt, 'MM-dd HH:mm')}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
