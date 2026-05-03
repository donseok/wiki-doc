import { cn } from '@/lib/utils';
import type { PageStatus } from '@/types';

const STATUS_LABEL: Record<PageStatus, string> = {
  Draft: '초안',
  Review: '검토',
  Approved: '승인',
  Pending: '보류',
  Archived: '보관',
};

const STATUS_CLASS: Record<PageStatus, string> = {
  Draft: 'bg-status-draft/15 text-status-draft border-status-draft/30',
  Review: 'bg-status-review/15 text-status-review border-status-review/40',
  Approved: 'bg-status-approved/15 text-status-approved border-status-approved/40',
  Pending: 'bg-status-pending/15 text-status-pending border-status-pending/40',
  Archived: 'bg-status-archived/15 text-status-archived border-status-archived/40',
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
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold',
        STATUS_CLASS[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
