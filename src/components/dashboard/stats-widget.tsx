/**
 * 통계 위젯 — FR-1005 (대시보드)
 *
 * - 전체 문서 수
 * - 상태별 분포 (Draft/Review/Approved/Pending/Archived)
 * - 최근 7일 일자별 활동량 (페이지 updatedAt 기준)
 *
 * 차트는 추가 라이브러리 없이 Tailwind 만으로 그린다 (CSS 막대그래프).
 */

import { BarChart3 } from 'lucide-react';
import { prisma } from '@/lib/db';
import type { PageStatus } from '@prisma/client';

const STATUS_ORDER: PageStatus[] = ['Draft', 'Review', 'Approved', 'Pending', 'Archived'];

const STATUS_LABEL: Record<PageStatus, string> = {
  Draft: '초안',
  Review: '검토',
  Approved: '승인',
  Pending: '대기',
  Archived: '보관',
};

const STATUS_BAR: Record<PageStatus, string> = {
  Draft: 'bg-slate-400',
  Review: 'bg-blue-400',
  Approved: 'bg-emerald-400',
  Pending: 'bg-amber-400',
  Archived: 'bg-zinc-400',
};

const DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function StatsWidget() {
  const today = startOfLocalDay(new Date());
  const since = new Date(today.getTime() - (DAYS - 1) * DAY_MS);

  const [total, byStatus, recentUpdates] = await Promise.all([
    prisma.page.count(),
    prisma.page.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.page.findMany({
      where: { updatedAt: { gte: since } },
      select: { updatedAt: true },
    }),
  ]);

  const counts = Object.fromEntries(
    byStatus.map((g) => [g.status as PageStatus, g._count._all]),
  ) as Partial<Record<PageStatus, number>>;

  // 일자별 버킷
  const buckets: { dayLabel: string; count: number; isoDate: string }[] = [];
  for (let i = 0; i < DAYS; i += 1) {
    const day = new Date(since.getTime() + i * DAY_MS);
    const iso = day.toISOString().slice(0, 10);
    const label = `${day.getMonth() + 1}/${day.getDate()}`;
    buckets.push({ dayLabel: label, count: 0, isoDate: iso });
  }
  for (const r of recentUpdates) {
    const dStart = startOfLocalDay(r.updatedAt);
    const idx = Math.round((dStart.getTime() - since.getTime()) / DAY_MS);
    if (idx >= 0 && idx < buckets.length) buckets[idx].count += 1;
  }
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const totalLast7d = buckets.reduce((acc, b) => acc + b.count, 0);

  return (
    <section
      className="rounded-lg border bg-card p-4 shadow-sm"
      aria-labelledby="stats-widget-title"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 id="stats-widget-title" className="flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="h-4 w-4" />
          통계
        </h2>
        <span className="text-xs text-muted-foreground">전체 {total}건</span>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">상태별 분포</div>
          <ul className="space-y-1" aria-label="페이지 상태별 분포">
            {STATUS_ORDER.map((s) => {
              const c = counts[s] ?? 0;
              const pct = total > 0 ? Math.round((c / total) * 100) : 0;
              return (
                <li key={s} className="flex items-center gap-2 text-xs">
                  <span className="w-10 shrink-0 text-muted-foreground">{STATUS_LABEL[s]}</span>
                  <div
                    className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={c}
                    aria-valuemin={0}
                    aria-valuemax={total}
                    aria-label={`${STATUS_LABEL[s]} ${c}건`}
                  >
                    <div
                      className={`h-full ${STATUS_BAR[s]} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right tabular-nums">
                    {c} <span className="text-muted-foreground">({pct}%)</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>최근 7일 활동</span>
            <span>총 {totalLast7d}건</span>
          </div>
          <div
            className="flex h-20 items-end gap-1.5"
            aria-label="최근 7일간 일자별 페이지 활동량"
          >
            {buckets.map((b) => {
              const heightPct = (b.count / maxCount) * 100;
              return (
                <div
                  key={b.isoDate}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${b.isoDate}: ${b.count}건`}
                >
                  <div
                    className="w-full rounded-t bg-primary/70 transition-all"
                    style={{ height: `${Math.max(heightPct, b.count > 0 ? 6 : 0)}%` }}
                    aria-hidden
                  />
                  <span className="text-[10px] text-muted-foreground">{b.dayLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
