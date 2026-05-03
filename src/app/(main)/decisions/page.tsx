/**
 * Decision 모아보기 — FR-1008
 *
 * 상태별 / 기간별 필터, 통계 카드, 페이지 바로가기 테이블.
 * 서버 컴포넌트로 동작하며 검색 파라미터로 필터를 받는다.
 */

import Link from 'next/link';
import { format } from 'date-fns';
import {
  Scale,
  Lightbulb,
  CheckCircle2,
  XCircle,
  ArrowRightCircle,
  ExternalLink,
} from 'lucide-react';
import { Prisma, DecisionStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SearchParams {
  status?: string;
  owner?: string;
  fromDate?: string;
  toDate?: string;
}

const STATUS_OPTIONS: DecisionStatus[] = ['Proposed', 'Accepted', 'Rejected', 'Superseded'];

const STATUS_META: Record<
  DecisionStatus,
  { label: string; icon: React.ReactNode; cardClass: string }
> = {
  Proposed: {
    label: '제안',
    icon: <Lightbulb className="h-4 w-4" />,
    cardClass: 'border-zinc-200 bg-zinc-50 text-zinc-800',
  },
  Accepted: {
    label: '승인',
    icon: <CheckCircle2 className="h-4 w-4" />,
    cardClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  Rejected: {
    label: '반려',
    icon: <XCircle className="h-4 w-4" />,
    cardClass: 'border-rose-200 bg-rose-50 text-rose-800',
  },
  Superseded: {
    label: '대체',
    icon: <ArrowRightCircle className="h-4 w-4" />,
    cardClass: 'border-amber-200 bg-amber-50 text-amber-800',
  },
};

function isStatus(v: string | undefined): v is DecisionStatus {
  return !!v && (STATUS_OPTIONS as readonly string[]).includes(v);
}

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const status = isStatus(searchParams.status) ? searchParams.status : undefined;
  const owner = searchParams.owner?.trim() || undefined;
  const fromDate = searchParams.fromDate || undefined;
  const toDate = searchParams.toDate || undefined;

  const where: Prisma.DecisionWhereInput = {
    ...(status ? { status } : {}),
    ...(owner ? { owner } : {}),
  };
  if (fromDate || toDate) {
    const range: Prisma.DateTimeFilter = {};
    if (fromDate) {
      const d = new Date(fromDate);
      if (!Number.isNaN(d.getTime())) range.gte = d;
    }
    if (toDate) {
      const d = new Date(toDate);
      if (!Number.isNaN(d.getTime())) range.lte = d;
    }
    if (Object.keys(range).length > 0) where.updatedAt = range;
  }

  const [decisions, statusCounts, ownerCounts] = await Promise.all([
    prisma.decision.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
      include: {
        page: { select: { id: true, treeNode: { select: { id: true, title: true } } } },
      },
    }),
    prisma.decision.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.decision.groupBy({
      by: ['owner'],
      _count: { _all: true },
      where: { owner: { not: null } },
      orderBy: { _count: { owner: 'desc' } },
      take: 8,
    }),
  ]);

  const statsMap = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Decision 모아보기</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          전사 의사결정 기록을 한 곳에서 조회합니다 (FR-507/508/1008).
        </p>
      </header>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STATUS_OPTIONS.map((s) => {
          const meta = STATUS_META[s];
          return (
            <Link
              key={s}
              href={`/decisions?status=${s}`}
              className={cn(
                'rounded-lg border p-4 shadow-sm transition hover:shadow-md',
                meta.cardClass,
              )}
            >
              <div className="flex items-center justify-between text-sm font-medium">
                <span className="inline-flex items-center gap-1.5">
                  {meta.icon}
                  {meta.label}
                </span>
              </div>
              <div className="mt-1 text-2xl font-bold">{statsMap[s] ?? 0}</div>
            </Link>
          );
        })}
      </div>

      {/* 필터 */}
      <form
        method="GET"
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4 shadow-sm"
        aria-label="Decision 필터"
      >
        <div className="flex flex-col">
          <label htmlFor="filter-status" className="mb-1 text-xs font-medium text-muted-foreground">
            상태
          </label>
          <select
            id="filter-status"
            name="status"
            defaultValue={status ?? ''}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">전체</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label htmlFor="filter-owner" className="mb-1 text-xs font-medium text-muted-foreground">
            담당자
          </label>
          <input
            id="filter-owner"
            name="owner"
            defaultValue={owner ?? ''}
            placeholder="@user"
            className="h-9 w-40 rounded-md border bg-background px-2 text-sm"
          />
        </div>

        <div className="flex flex-col">
          <label htmlFor="filter-from" className="mb-1 text-xs font-medium text-muted-foreground">
            시작일
          </label>
          <input
            id="filter-from"
            type="date"
            name="fromDate"
            defaultValue={fromDate ?? ''}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          />
        </div>

        <div className="flex flex-col">
          <label htmlFor="filter-to" className="mb-1 text-xs font-medium text-muted-foreground">
            종료일
          </label>
          <input
            id="filter-to"
            type="date"
            name="toDate"
            defaultValue={toDate ?? ''}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
        >
          필터 적용
        </button>
        {(status || owner || fromDate || toDate) && (
          <Link
            href="/decisions"
            className="h-9 rounded-md border bg-background px-3 text-sm leading-9 hover:bg-accent"
          >
            초기화
          </Link>
        )}
      </form>

      {/* 담당자 통계 (보조) */}
      {ownerCounts.length > 0 && (
        <section className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold">담당자별 건수 (상위 8)</h2>
          <div className="flex flex-wrap gap-2">
            {ownerCounts.map((o) => (
              <Link
                key={o.owner ?? 'none'}
                href={`/decisions?owner=${encodeURIComponent(o.owner ?? '')}`}
                className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
              >
                @{o.owner}
                <Badge variant="secondary">{o._count._all}</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 테이블 */}
      <section className="rounded-lg border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h2 className="text-sm font-semibold">목록 ({decisions.length})</h2>
        </div>
        {decisions.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            조건에 해당하는 Decision 이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">상태</th>
                  <th className="px-3 py-2 text-left font-medium">제목</th>
                  <th className="px-3 py-2 text-left font-medium">담당자</th>
                  <th className="px-3 py-2 text-left font-medium">결정일</th>
                  <th className="px-3 py-2 text-left font-medium">최종 갱신</th>
                  <th className="px-3 py-2 text-left font-medium">페이지</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {decisions.map((d) => {
                  const meta = STATUS_META[d.status];
                  return (
                    <tr key={d.id} className="hover:bg-accent/30">
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold',
                            meta.cardClass,
                          )}
                        >
                          {meta.icon}
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium">{d.title}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {d.owner ? `@${d.owner}` : '-'}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {d.decidedAt ? format(d.decidedAt, 'yyyy-MM-dd') : '-'}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {format(d.updatedAt, 'yyyy-MM-dd HH:mm')}
                      </td>
                      <td className="px-3 py-2">
                        {d.page?.treeNode ? (
                          <Link
                            href={`/pages/${d.page.id}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            {d.page.treeNode.title}
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
    </div>
  );
}
