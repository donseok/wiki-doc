/**
 * Action Items 모아보기 — FR-1007
 *
 * 전체 Action Items 를 필터링/정렬해서 보여준다.
 *  - 필터: assignee (담당자), completed, dueDate 범위
 *  - 일괄 완료 처리는 클라이언트 컴포넌트(ActionItemsTable)에서 담당
 *  - 본인 미완료 항목을 위로 정렬 (ALL 보기 시)
 */

import Link from 'next/link';
import { ArrowLeft, ListChecks } from 'lucide-react';
import { Prisma } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';
import { ActionItemsTable } from '@/components/dashboard/action-items-table';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SearchParams {
  assignee?: string;
  completed?: string;
  fromDate?: string;
  toDate?: string;
}

export default async function ActionItemsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = getCurrentUserServer();

  const assignee = searchParams.assignee?.trim() || undefined;
  const completedRaw = searchParams.completed;
  const completed =
    completedRaw === 'true' ? true : completedRaw === 'false' ? false : undefined;
  const fromDate = searchParams.fromDate || undefined;
  const toDate = searchParams.toDate || undefined;

  const where: Prisma.ActionItemWhereInput = {
    ...(assignee ? { assignee } : {}),
    ...(completed !== undefined ? { completed } : {}),
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
    if (Object.keys(range).length > 0) where.dueDate = range;
  }

  const [items, assigneeCounts] = await Promise.all([
    prisma.actionItem.findMany({
      where,
      orderBy: [{ completed: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 500,
      include: {
        page: { select: { id: true, treeNode: { select: { id: true, title: true } } } },
      },
    }),
    prisma.actionItem.groupBy({
      by: ['assignee'],
      _count: { _all: true },
      where: { assignee: { not: null } },
      orderBy: { _count: { assignee: 'desc' } },
      take: 10,
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <ListChecks className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">Action Items 모아보기</h1>
      </header>

      <p className="text-sm text-muted-foreground">
        본문 체크박스 (`- [ ] @user 내용`) 로 자동 추출된 항목과 수동 추가 항목을 모두 표시합니다.
      </p>

      {/* 빠른 담당자 필터 */}
      {assigneeCounts.length > 0 && (
        <section className="rounded-lg border bg-card p-3 shadow-sm">
          <div className="mb-1.5 text-xs font-semibold text-muted-foreground">
            담당자 빠른 필터
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/action-items?assignee=${encodeURIComponent(me)}&completed=false`}
              className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
            >
              내 미완료
            </Link>
            <Link
              href="/action-items"
              className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
            >
              전체
            </Link>
            {assigneeCounts.map((a) => (
              <Link
                key={a.assignee ?? 'none'}
                href={`/action-items?assignee=${encodeURIComponent(a.assignee ?? '')}`}
                className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
              >
                @{a.assignee} ({a._count._all})
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 필터 폼 */}
      <form
        method="GET"
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4 shadow-sm"
        aria-label="Action Items 필터"
      >
        <div className="flex flex-col">
          <label htmlFor="ai-assignee" className="mb-1 text-xs font-medium text-muted-foreground">
            담당자
          </label>
          <input
            id="ai-assignee"
            name="assignee"
            defaultValue={assignee ?? ''}
            placeholder="@user"
            className="h-9 w-40 rounded-md border bg-background px-2 text-sm"
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor="ai-completed" className="mb-1 text-xs font-medium text-muted-foreground">
            완료 여부
          </label>
          <select
            id="ai-completed"
            name="completed"
            defaultValue={completedRaw ?? ''}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">전체</option>
            <option value="false">미완료</option>
            <option value="true">완료</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label htmlFor="ai-from" className="mb-1 text-xs font-medium text-muted-foreground">
            기한 시작
          </label>
          <input
            id="ai-from"
            type="date"
            name="fromDate"
            defaultValue={fromDate ?? ''}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor="ai-to" className="mb-1 text-xs font-medium text-muted-foreground">
            기한 종료
          </label>
          <input
            id="ai-to"
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
        {(assignee || completedRaw || fromDate || toDate) && (
          <Link
            href="/action-items"
            className="h-9 rounded-md border bg-background px-3 text-sm leading-9 hover:bg-accent"
          >
            초기화
          </Link>
        )}
      </form>

      {/* 일괄 완료 처리 + 테이블 */}
      <ActionItemsTable
        initialItems={items.map((i) => ({
          id: i.id,
          content: i.content,
          assignee: i.assignee,
          completed: i.completed,
          completedAt: i.completedAt ? i.completedAt.toISOString() : null,
          dueDate: i.dueDate ? i.dueDate.toISOString() : null,
          pageId: i.pageId,
          page: i.page
            ? { id: i.page.id, treeNode: { id: i.page.treeNode.id, title: i.page.treeNode.title } }
            : null,
          createdAt: i.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
