import Link from 'next/link';
import { format } from 'date-fns';
import { Activity, AlertCircle, Clock, FileText, ListChecks, Scale, ArrowUpRight, TrendingUp } from 'lucide-react';
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
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      {/* Hero */}
      <div className="animate-slide-up">
        <h1 className="text-2xl font-bold tracking-tight">대시보드</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          안녕하세요, <span className="font-medium text-foreground">{me}</span>님 — Atlas 활동 현황입니다.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5 animate-slide-up" style={{ animationDelay: '50ms' }}>
        <StatCard icon={<FileText className="h-4 w-4" />} label="전체 문서" value={totalPages} color="primary" />
        <StatCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="Pending"
          value={statusMap.Pending ?? 0}
          color="pending"
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="검토 중"
          value={statusMap.Review ?? 0}
          color="review"
        />
        <StatCard icon={<Scale className="h-4 w-4" />} label="Decisions" value={totalDecisions} color="indigo" />
        <StatCard
          icon={<ListChecks className="h-4 w-4" />}
          label="Action Items"
          value={totalActionItems}
          color="emerald"
        />
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3 animate-slide-up" style={{ animationDelay: '100ms' }}>
        <div className="space-y-6 lg:col-span-2">
          {/* Recent changes */}
          <Widget icon={<Clock className="h-4 w-4 text-blue-500" />} title="최근 변경된 문서" link="/search">
            {recentPages.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">아직 변경된 문서가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-border/50">
                {recentPages.map((p) => (
                  <li key={p.id} className="group">
                    <Link
                      href={`/pages/${p.id}`}
                      className="flex items-center gap-3 px-1 py-2.5 transition-colors hover:bg-accent/30 rounded-lg"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-sm">
                        {p.treeNode.icon || '📄'}
                      </span>
                      <span className="flex-1 truncate text-sm font-medium">{p.treeNode.title}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {format(p.updatedAt, 'MM.dd HH:mm')}
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/0 transition-all group-hover:text-muted-foreground/60" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Widget>

          <ActivityFeed limit={30} />

          {/* Pending items */}
          <Widget
            icon={<AlertCircle className="h-4 w-4 text-status-pending" />}
            title="Pending 항목"
            link="/search?status=Pending"
          >
            {pendingPages.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">결정 대기 중인 항목이 없습니다. 👏</p>
            ) : (
              <ul className="divide-y divide-border/50">
                {pendingPages.map((p) => (
                  <li key={p.id} className="group">
                    <Link
                      href={`/pages/${p.id}`}
                      className="flex items-start gap-3 px-1 py-2.5 transition-colors hover:bg-accent/30 rounded-lg"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-status-pending/10 text-sm">
                        {p.treeNode.icon || '📄'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.treeNode.title}</div>
                        {p.pendingReason && (
                          <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {p.pendingReason}
                          </div>
                        )}
                      </div>
                      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/0 transition-all group-hover:text-muted-foreground/60" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Widget>
        </div>

        <div className="space-y-6 lg:col-span-1">
          <ActionItemsWidget currentUser={me} />
          <DecisionWidget />
          <StatsWidget />
          <MyPagesWidget currentUser={me} />
        </div>
      </div>
    </div>
  );
}

/* ── Stat Card ── */
const COLOR_MAP: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  pending: 'bg-status-pending/10 text-status-pending',
  review: 'bg-status-review/10 text-status-review',
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

function StatCard({
  icon,
  label,
  value,
  color = 'primary',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="glass-card group flex flex-col gap-3 p-4 hover-lift cursor-default">
      <div className="flex items-center justify-between">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${COLOR_MAP[color] ?? COLOR_MAP.primary}`}>
          {icon}
        </span>
        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/0 transition-all group-hover:text-muted-foreground/40" />
      </div>
      <div>
        <div className="text-2xl font-bold tracking-tight tabular-nums">{value}</div>
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

/* ── Widget wrapper ── */
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
    <section className="glass-card overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold">
          {icon}
          {title}
        </h2>
        {link && (
          <Link href={link} className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary">
            더 보기
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
