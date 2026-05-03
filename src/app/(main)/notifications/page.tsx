import { format } from 'date-fns';
import { Bell, BellOff } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const me = getCurrentUserServer();
  const items = await prisma.notification.findMany({
    where: { recipient: me },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">알림</h1>
        <span className="text-sm text-muted-foreground">@{me}</span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-12 text-muted-foreground">
          <BellOff className="h-8 w-8" />
          <p>새 알림이 없습니다.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const payload = (n.payload || {}) as Record<string, unknown>;
            const message = (payload.message as string) || `[${n.type}]`;
            return (
              <li
                key={n.id}
                className={`flex items-start gap-3 rounded-md border bg-card p-3 ${
                  n.readAt ? 'opacity-70' : ''
                }`}
              >
                <Bell className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm">{message}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(n.createdAt, 'yyyy-MM-dd HH:mm')} · {n.type}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
