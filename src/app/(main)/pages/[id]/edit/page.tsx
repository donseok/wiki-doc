import { notFound } from 'next/navigation';
import dynamicLoad from 'next/dynamic';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/page/page-header';

// TipTap 은 SSR 호환을 위해 동적 import + 클라이언트 전용
const TiptapEditor = dynamicLoad(
  () => import('@/components/editor/tiptap-editor').then((m) => m.TiptapEditor),
  { ssr: false, loading: () => <div className="p-6 text-sm text-muted-foreground">에디터 로딩 중...</div> },
);

export const dynamic = 'force-dynamic';

export default async function PageEdit({ params }: { params: { id: string } }) {
  const page = await prisma.page.findFirst({
    where: { OR: [{ id: params.id }, { treeNodeId: params.id }] },
    include: {
      treeNode: { select: { id: true, title: true, icon: true } },
      tags: { include: { tag: true } },
    },
  });
  if (!page) notFound();

  const data = JSON.parse(JSON.stringify(page));

  return (
    <div className="flex h-full flex-col">
      <PageHeader page={data} mode="edit" />
      <TiptapEditor page={data} />
    </div>
  );
}
