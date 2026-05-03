import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { KanbanBoard } from '@/components/kanban/kanban-board';
import type { KanbanCardData } from '@/lib/kanban';

export const dynamic = 'force-dynamic';

export default async function BoardDetailPage({ params }: { params: { id: string } }) {
  const board = await prisma.board.findUnique({
    where: { id: params.id },
    include: { cards: { orderBy: [{ column: 'asc' }, { order: 'asc' }] } },
  });
  if (!board) notFound();

  const cards: KanbanCardData[] = board.cards.map((c) => ({
    id: c.id,
    boardId: c.boardId,
    column: c.column,
    title: c.title,
    body: c.body,
    color: c.color,
    order: c.order,
    authorName: c.authorName,
    linkedPageId: c.linkedPageId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">{board.name}</h1>
        {board.description && (
          <p className="mt-1 text-sm text-muted-foreground">{board.description}</p>
        )}
      </div>

      <KanbanBoard boardId={board.id} initialCards={cards} />
    </div>
  );
}
