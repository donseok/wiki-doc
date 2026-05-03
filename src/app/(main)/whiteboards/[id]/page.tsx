import { notFound } from 'next/navigation';
import dynamicLoad from 'next/dynamic';
import { prisma } from '@/lib/db';

// tldraw 는 SSR 비호환 — 클라이언트 전용 동적 import
const WhiteboardCanvas = dynamicLoad(
  () => import('@/components/whiteboard/whiteboard-canvas').then((m) => m.WhiteboardCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        화이트보드 로딩 중...
      </div>
    ),
  },
);

export const dynamic = 'force-dynamic';

export default async function WhiteboardPage({ params }: { params: { id: string } }) {
  // params.id 가 Whiteboard.id 일 수도 있고 TreeNode.id 일 수도 있음 (사이드바에서 양쪽 다 링크)
  const wb = await prisma.whiteboard.findFirst({
    where: { OR: [{ id: params.id }, { treeNodeId: params.id }] },
    include: { treeNode: true },
  });
  if (!wb) notFound();

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <WhiteboardCanvas
        whiteboardId={wb.id}
        initialTitle={wb.title}
        initialSnapshot={wb.viewportJson ?? null}
      />
    </div>
  );
}
