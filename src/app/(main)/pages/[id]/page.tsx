import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';
import { PageHeader } from '@/components/page/page-header';
import { MarkdownView } from '@/components/page/markdown-view';
import { EditLockBanner } from '@/components/page/edit-lock-banner';
import { RecentTracker } from '@/components/page/recent-tracker';
import { PageBodyWithComments } from '@/components/comments/page-body-with-comments';

export const dynamic = 'force-dynamic';

export default async function PageView({ params }: { params: { id: string } }) {
  const page = await prisma.page.findUnique({
    where: { id: params.id },
    include: {
      treeNode: { select: { id: true, title: true, icon: true } },
      tags: { include: { tag: true } },
    },
  });
  if (!page) notFound();

  const data = JSON.parse(JSON.stringify(page));
  const currentUser = getCurrentUserServer();

  return (
    <div className="flex h-full flex-col">
      <PageHeader page={data} mode="view" />
      <PageBodyWithComments pageId={page.id} currentUser={currentUser}>
        <div className="mb-3">
          <EditLockBanner pageId={page.id} mode="view" />
        </div>
        {page.status === 'Pending' && page.pendingReason && (
          <div className="mb-4 rounded-md border border-status-pending/40 bg-status-pending/5 p-3 text-sm">
            <strong>보류 사유:</strong> {page.pendingReason}
          </div>
        )}
        <MarkdownView source={page.contentMarkdown} pageId={page.id} />
      </PageBodyWithComments>
      <RecentTracker pageId={page.treeNode.id} title={page.treeNode.title} />
    </div>
  );
}
