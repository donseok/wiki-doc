import Link from 'next/link';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function TagsPage({ searchParams }: { searchParams: { name?: string } }) {
  const filter = searchParams.name?.trim();

  const tags = await prisma.tag.findMany({
    include: { _count: { select: { pages: true } } },
    orderBy: [{ pages: { _count: 'desc' } }, { name: 'asc' }],
  });

  let pages: { id: string; treeNodeId: string; treeNode: { title: string }; status: string }[] = [];
  if (filter) {
    const result = await prisma.page.findMany({
      where: { tags: { some: { tag: { name: filter } } } },
      include: { treeNode: { select: { title: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    pages = result as typeof pages;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-2xl font-bold">태그</h1>

      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 태그가 없습니다.</p>
      ) : (
        <div className="mb-6 flex flex-wrap gap-2">
          {tags.map((t) => (
            <Link
              key={t.id}
              href={`/tags?name=${encodeURIComponent(t.name)}`}
              className={`rounded-md border px-3 py-1 text-sm hover:bg-accent ${
                filter === t.name ? 'border-primary bg-accent' : ''
              }`}
            >
              #{t.name}
              <span className="ml-1.5 text-xs text-muted-foreground">{t._count.pages}</span>
            </Link>
          ))}
        </div>
      )}

      {filter && (
        <section>
          <h2 className="mb-3 font-semibold">#{filter} 가 부착된 문서</h2>
          {pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">해당 태그가 부착된 문서가 없습니다.</p>
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {pages.map((p) => (
                <li key={p.id} className="px-4 py-2.5">
                  <Link href={`/pages/${p.id}`} className="text-sm hover:underline">
                    {p.treeNode.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
