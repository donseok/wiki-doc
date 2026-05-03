import Link from 'next/link';
import { format } from 'date-fns';
import { Activity, AlertCircle, Clock, FileText, ListChecks, Scale } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';
import { ActionItemsWidget } from '@/components/dashboard/action-items-widget';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { DecisionWidget } from '@/components/dashboard/decision-widget';
import { MyPagesWidget } from '@/components/dashboard/my-pages-widget';
import { StatsWidget } from '@/components/dashboard/stats-widget';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const me = getCurrentUserServer();
  const [recentPages, pendingPages, totalPages, byStatus, totalDecisions, totalActionItems] =
    await Promise.all([
      prisma.page.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: { treeNode: { select: { id: true, title: true, icon: true } } },
      }),
      prisma.page.findMany({
        where: { status: 'Pending' },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: { treeNode: { select: { id: true, title: true, icon: true } } },
      }),
      prisma.page.count(),
      prisma.page.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.decision.count(),
      prisma.actionItem.count(),
    ]);

  const statusMap = Object.fromEntries(byStatus.map((b) => [b.status, b._count._all]));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">대시보드</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          PI Wiki — MES/APS PI 활동의 단일 진실 공급원
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard icon={<FileText className="h-4 w-4" />} label="문서" value={totalPages} />
        <StatCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="Pending"
          value={statusMap.Pending ?? 0}
          accent="status-pending"
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="검토 중"
          value={statusMap.Review ?? 0}
          accent="status-review"
        />
        <StatCard icon={<Scale className="h-4 w-4" />} label="Decisions" value={totalDecisions} />
        <StatCard
          icon={<ListChecks className="h-4 w-4" />}
          label="Action Items"
          value={totalActionItems}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Widget icon={<Clock className="h-4 w-4" />} title="최근 변경된 문서" link="/search">
            {recentPages.length === 0 ? (
              <p className="text-sm text-muted-foreground">아직 변경된 문서가 없습니다.</p>
            ) : (
              <ul className="divide-y">
                {recentPages.map((p) => (
                  <li key={p.id} className="py-2">
                    <Link
                      href={`/pages/${p.id}`}
                      className="flex items-center gap-2 text-sm hover:underline"
                    >
                      <span>{p.treeNode.icon || '📄'}</span>
                      <span className="flex-1 truncate">{p.treeNode.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(p.updatedAt, 'MM-dd HH:mm')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Widget>

          <ActivityFeed limit={30} />

          <Widget
            icon={<AlertCircle className="h-4 w-4" />}
            title="Pending 항목"
            link="/search?status=Pending"
          >
            {pendingPages.length === 0 ? (
              <p className="text-sm text-muted-foreground">결정 대기 중인 항목이 없습니다.</p>
            ) : (
              <ul className="divide-y">
                {pendingPages.map((p) => (
                  <li key={p.id} className="py-2">
                    <Link
                      href={`/pages/${p.id}`}
                      className="flex items-start gap-2 text-sm hover:underline"
                    >
                      <span>{p.treeNode.icon || '📄'}</span>
                      <div className="flex-1">
                        <div className="font-medium">{p.treeNode.title}</div>
                        {p.pendingReason && (
                          <div className="line-clamp-1 text-xs text-muted-foreground">
                            {p.pendingReason}
                          </div>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Widget>
        </div>

        <div className="space-y-4 lg:col-span-1">
          <ActionItemsWidget currentUser={me} />
          <DecisionWidget />
          <StatsWidget />
          <MyPagesWidget currentUser={me} />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {icon}
          {label}
        </span>
      </div>
      <div className={`mt-1 text-2xl font-bold ${accent ? `text-${accent}` : ''}`}>{value}</div>
    </div>
  );
}

function Widget({
  icon,
  title,
  children,
  link,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  link?: string;
}) {
  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </h2>
        {link && (
          <Link href={link} className="text-xs text-muted-foreground hover:underline">
            더 보기 →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
