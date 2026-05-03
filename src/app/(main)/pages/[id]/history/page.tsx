/**
 * 페이지 버전 이력 — FR-401 / FR-402 / FR-403 / FR-404
 *
 * 서버 컴포넌트에서 버전 메타와 상태 변경 이력을 미리 로드.
 * 비교/복원 UI 는 클라이언트 컴포넌트(VersionHistoryClient)가 담당.
 */

import Link from 'next/link';
import { ArrowLeft, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { VersionHistoryClient } from '@/components/page/version-history-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function HistoryPage({ params }: { params: { id: string } }) {
  const page = await prisma.page.findUnique({
    where: { id: params.id },
    include: {
      treeNode: { select: { title: true, icon: true } },
      versions: {
        orderBy: { versionNo: 'desc' },
        select: {
          id: true,
          versionNo: true,
          summary: true,
          authorName: true,
          createdAt: true,
          label: true,
        },
      },
      statusHistory: { orderBy: { changedAt: 'desc' }, take: 20 },
    },
  });
  if (!page) notFound();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/pages/${page.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <History className="h-5 w-5" />
        <h1 className="text-2xl font-bold">버전 이력 — {page.treeNode.title}</h1>
      </div>

      <VersionHistoryClient
        pageId={page.id}
        versions={page.versions.map((v) => ({
          id: v.id,
          versionNo: v.versionNo,
          summary: v.summary,
          authorName: v.authorName,
          createdAt: v.createdAt.toISOString(),
          label: v.label,
        }))}
      />

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold">상태 변경 이력 (FR-703)</h2>
        {page.statusHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">상태 변경이 없습니다.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {page.statusHistory.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="text-xs text-muted-foreground">
                  {s.fromStatus ?? '(없음)'} → <strong>{s.toStatus}</strong>
                </span>
                {s.note && <span className="flex-1 truncate text-xs text-muted-foreground">{s.note}</span>}
                <span className="text-xs text-muted-foreground">@{s.changedBy}</span>
                <span className="text-xs text-muted-foreground">
                  {format(s.changedAt, 'yyyy-MM-dd HH:mm')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
