/**
 * 내 작성 문서 위젯 — FR-1003 (대시보드)
 *
 * 본인이 작성자(authorName=me) 인 페이지 + 본인이 만든 PageVersion 의 page distinct
 * 두 집합을 합쳐 최근 수정순으로 표시 (최대 8건).
 */

import Link from 'next/link';
import { format } from 'date-fns';
import { FileText } from 'lucide-react';
import { prisma } from '@/lib/db';
import type { PageStatus } from '@prisma/client';

interface Props {
  currentUser: string;
}

const STATUS_LABEL: Record<PageStatus, string> = {
  Draft: '초안',
  Review: '검토',
  Approved: '승인',
  Pending: '대기',
  Archived: '보관',
};

const STATUS_COLOR: Record<PageStatus, string> = {
  Draft: 'border-slate-300 bg-slate-50 text-slate-700',
  Review: 'border-blue-300 bg-blue-50 text-blue-800',
  Approved: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  Pending: 'border-amber-300 bg-amber-50 text-amber-900',
  Archived: 'border-zinc-300 bg-zinc-50 text-zinc-600',
};

export async function MyPagesWidget({ currentUser }: Props) {
  // 1) 본인이 author 인 페이지 ID
  // 2) 본인이 만든 PageVersion 의 pageId distinct
  const [authoredPages, versionAuthoredPageIds] = await Promise.all([
    prisma.page.findMany({
      where: { authorName: currentUser },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        status: true,
        updatedAt: true,
        treeNode: { select: { title: true, icon: true } },
      },
    }),
    prisma.pageVersion.findMany({
      where: { authorName: currentUser },
      distinct: ['pageId'],
      select: { pageId: true },
      take: 100,
    }),
  ]);

  const authoredIds = new Set(authoredPages.map((p) => p.id));
  const extraIds = versionAuthoredPageIds.map((v) => v.pageId).filter((id) => !authoredIds.has(id));

  const extraPages =
    extraIds.length === 0
      ? []
      : await prisma.page.findMany({
          where: { id: { in: extraIds } },
          orderBy: { updatedAt: 'desc' },
          take: 30,
          select: {
            id: true,
            status: true,
            updatedAt: true,
            treeNode: { select: { title: true, icon: true } },
          },
        });

  const merged = [...authoredPages, ...extraPages]
    .sort((a, b) => +b.updatedAt - +a.updatedAt)
    .slice(0, 8);

  return (
    <section
      className="rounded-lg border bg-card p-4 shadow-sm"
      aria-labelledby="my-pages-widget-title"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2
          id="my-pages-widget-title"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <FileText className="h-4 w-4" />내 작성 문서
          <span className="text-xs font-normal text-muted-foreground">@{currentUser}</span>
        </h2>
        <Link
          href={`/search?author=${encodeURIComponent(currentUser)}`}
          className="text-xs text-muted-foreground hover:underline"
        >
          전체 보기 →
        </Link>
      </div>

      {merged.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          작성/수정한 문서가 없습니다.
        </p>
      ) : (
        <ul className="divide-y">
          {merged.map((p) => (
            <li key={p.id} className="py-1.5">
              <Link
                href={`/pages/${p.id}`}
                className="flex items-center gap-2 text-sm hover:underline"
              >
                <span aria-hidden>{p.treeNode.icon || '📄'}</span>
                <span className="flex-1 truncate font-medium">{p.treeNode.title}</span>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${STATUS_COLOR[p.status]}`}
                >
                  {STATUS_LABEL[p.status]}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {format(p.updatedAt, 'MM-dd')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
