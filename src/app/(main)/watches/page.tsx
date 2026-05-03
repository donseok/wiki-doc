import Link from 'next/link';
import { BellOff, Bell, Folder } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';
import { UnwatchButton } from './unwatch-button';

export const dynamic = 'force-dynamic';

export default async function WatchesPage() {
  const me = getCurrentUserServer();

  const items = await prisma.pageWatch.findMany({
    where: { watcherName: me },
    orderBy: { createdAt: 'desc' },
    include: {
      page: { select: { id: true, treeNode: { select: { id: true, title: true, icon: true } } } },
      treeNode: { select: { id: true, title: true, icon: true } },
    },
  });

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center gap-2">
        <Bell className="h-5 w-5" />
        <h1 className="text-2xl font-bold">내 구독</h1>
        <span className="text-sm text-muted-foreground">@{me}</span>
      </div>

      <p className="mb-4 rounded border bg-secondary/30 p-3 text-xs text-muted-foreground">
        구독한 페이지·폴더의 변경 사항이 알림으로 전달됩니다 (FR-905/906).
        폴더 구독 시 하위 페이지 변경도 함께 받을 수 있습니다.
      </p>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-12 text-muted-foreground">
          <BellOff className="h-8 w-8" />
          <p>구독 중인 페이지가 없습니다.</p>
          <p className="text-xs">페이지 우상단의 [구독] 버튼으로 추가할 수 있습니다.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {items.map((w) => {
            const isFolder = !!w.treeNodeId;
            const target = w.page
              ? { id: w.page.id, title: w.page.treeNode.title, icon: w.page.treeNode.icon }
              : w.treeNode
                ? { id: w.treeNode.id, title: w.treeNode.title, icon: w.treeNode.icon }
                : null;
            if (!target) return null;
            return (
              <li key={w.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg">
                  {target.icon || (isFolder ? <Folder className="h-4 w-4" /> : '📄')}
                </span>
                <div className="flex-1">
                  {isFolder ? (
                    <span className="font-medium">{target.title}</span>
                  ) : (
                    <Link href={`/pages/${target.id}`} className="font-medium hover:underline">
                      {target.title}
                    </Link>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {isFolder ? (
                      <>
                        <span>폴더</span>
                        {w.includeChildren && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                            하위 포함
                          </span>
                        )}
                      </>
                    ) : (
                      <span>페이지</span>
                    )}
                    <span>·</span>
                    <span>{new Date(w.createdAt).toLocaleString()} 부터</span>
                  </div>
                </div>
                <UnwatchButton
                  pageId={w.pageId ?? undefined}
                  treeNodeId={w.treeNodeId ?? undefined}
                  label={target.title}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
