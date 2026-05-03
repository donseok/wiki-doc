import { cn } from '@/lib/utils';
import type { PageStatus } from '@/types';

const STATUS_LABEL: Record<PageStatus, string> = {
  Draft: '초안',
  Review: '검토',
  Approved: '승인',
  Pending: '보류',
  Archived: '보관',
};

const STATUS_DOT: Record<PageStatus, string> = {
  Draft: 'bg-slate-400 dark:bg-slate-500',
  Review: 'bg-amber-400 dark:bg-amber-500 animate-pulse',
  Approved: 'bg-emerald-400 dark:bg-emerald-500',
  Pending: 'bg-rose-400 dark:bg-rose-500 animate-pulse',
  Archived: 'bg-zinc-400 dark:bg-zinc-500',
};

const STATUS_CLASS: Record<PageStatus, string> = {
  Draft: 'bg-slate-100 text-slate-600 dark:bg-slate-900/40 dark:text-slate-400',
  Review: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Pending: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
  Archived: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900/40 dark:text-zinc-500',
};

export function StatusBadge({
  status,
  className,
}: {
  status: PageStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide transition-colors',
        STATUS_CLASS[status],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}
