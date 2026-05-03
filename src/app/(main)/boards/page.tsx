import Link from 'next/link';
import { KanbanSquare } from 'lucide-react';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function BoardsPage() {
  const boards = await prisma.board.findMany({
    include: { _count: { select: { cards: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">아이디어 보드 (칸반)</h1>
      </div>

      <p className="mb-4 rounded border bg-secondary/30 p-3 text-xs text-muted-foreground">
        결정해야 할 항목 추적용 칸반 보드입니다 (FR-601~608). 자유 사고/발산용은
        <Link href="/whiteboards" className="ml-1 underline">
          화이트보드
        </Link>
        를 이용하세요. — Sprint 3 에서 보드 UI 구현, 현재는 보드 목록만 표시.
      </p>

      {boards.length === 0 ? (
        <p className="text-sm text-muted-foreground">보드가 없습니다.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {boards.map((b) => (
            <li key={b.id}>
              <Link
                href={`/boards/${b.id}`}
                className="block rounded-lg border bg-card p-4 hover:bg-accent"
              >
                <div className="flex items-center gap-2">
                  <KanbanSquare className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{b.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{b._count.cards} 카드</span>
                </div>
                {b.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{b.description}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
