'use client';

/**
 * Decision 블록 NodeView (FR-507 / FR-508)
 *
 *  - 헤더: 상태별 아이콘 + 제목 입력 + 상태 selectbox
 *  - 본문: paragraph children (TipTap NodeViewContent)
 *  - 좌측 색상 띠: 상태별 색상 (제안=회색, 승인=초록, 반려=빨강, 대체=노랑)
 *  - 상태 변경 시 PATCH /api/decisions/[id] 호출 (decisionId 가 있는 경우)
 *  - hover 시 상태 변경 이력 툴팁 (DecisionStatusLog)
 */

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useCallback, useEffect, useState } from 'react';
import {
  Lightbulb,
  CheckCircle2,
  XCircle,
  ArrowRightCircle,
  History as HistoryIcon,
  Loader2,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import type { DecisionStatus } from './decision-node';

type StatusLog = {
  id: string;
  fromStatus: DecisionStatus | null;
  toStatus: DecisionStatus;
  changedBy: string;
  note: string | null;
  changedAt: string;
};

const STATUS_META: Record<
  DecisionStatus,
  { label: string; icon: React.ReactNode; bandClass: string; badgeClass: string }
> = {
  Proposed: {
    label: '제안',
    icon: <Lightbulb className="h-4 w-4" />,
    bandClass: 'bg-zinc-300 dark:bg-zinc-600',
    badgeClass:
      'border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300',
  },
  Accepted: {
    label: '승인',
    icon: <CheckCircle2 className="h-4 w-4" />,
    bandClass: 'bg-emerald-500',
    badgeClass:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
  Rejected: {
    label: '반려',
    icon: <XCircle className="h-4 w-4" />,
    bandClass: 'bg-rose-500',
    badgeClass:
      'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  },
  Superseded: {
    label: '대체',
    icon: <ArrowRightCircle className="h-4 w-4" />,
    bandClass: 'bg-amber-400',
    badgeClass:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
};

export function DecisionNodeView({ node, updateAttributes }: NodeViewProps) {
  const decisionId = (node.attrs.decisionId as string | null) ?? null;
  const title = (node.attrs.title as string) ?? '의사결정 제목';
  const status = ((node.attrs.status as DecisionStatus) ?? 'Proposed') as DecisionStatus;

  const [titleDraft, setTitleDraft] = useState(title);
  const [savingStatus, setSavingStatus] = useState(false);
  const [logs, setLogs] = useState<StatusLog[] | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);

  // 외부 상태(다른 사용자에 의한 갱신 등) 동기화
  useEffect(() => {
    setTitleDraft(title);
  }, [title]);

  /** 상태 변경 — 즉시 NodeView attrs 갱신 + 서버에 PATCH (decisionId 있을 때만) */
  const onStatusChange = useCallback(
    async (next: string) => {
      const nextStatus = next as DecisionStatus;
      if (nextStatus === status) return;
      updateAttributes({ status: nextStatus });
      if (!decisionId) return; // 아직 서버에 반영 전. 페이지 저장 시 동기화됨.
      setSavingStatus(true);
      try {
        const res = await fetch(`/api/decisions/${decisionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error ?? '상태 변경 실패');
        }
        // 로그 캐시 무효화
        setLogs(null);
        toast({ title: `상태가 "${STATUS_META[nextStatus].label}" 로 변경되었습니다` });
      } catch (e) {
        // 실패 시 원복
        updateAttributes({ status });
        toast({
          title: '상태 변경 실패',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      } finally {
        setSavingStatus(false);
      }
    },
    [decisionId, status, updateAttributes],
  );

  /** 제목 입력 — blur 시점에 attrs 반영 */
  const onTitleBlur = useCallback(() => {
    if (titleDraft.trim() && titleDraft !== title) {
      updateAttributes({ title: titleDraft.trim() });
    } else if (!titleDraft.trim()) {
      setTitleDraft(title);
    }
  }, [titleDraft, title, updateAttributes]);

  /** 변경 이력 popover 열림 시 fetch */
  const onLogsOpenChange = useCallback(
    async (open: boolean) => {
      if (!open || !decisionId || logs !== null) return;
      setLogsLoading(true);
      try {
        const res = await fetch(`/api/decisions/${decisionId}?include=logs`, { cache: 'no-store' });
        const json = await res.json().catch(() => null);
        if (json?.ok && Array.isArray(json.data?.statusLogs)) {
          setLogs(json.data.statusLogs as StatusLog[]);
        } else {
          setLogs([]);
        }
      } catch {
        setLogs([]);
      } finally {
        setLogsLoading(false);
      }
    },
    [decisionId, logs],
  );

  const meta = STATUS_META[status];

  return (
    <NodeViewWrapper
      data-type="decision-block"
      data-decision-id={decisionId ?? undefined}
      data-status={status}
      className="pi-decision-block group relative my-4 overflow-hidden rounded-md border bg-card shadow-sm"
    >
      {/* 좌측 상태 색상 띠 */}
      <div
        aria-hidden
        className={`absolute left-0 top-0 h-full w-1.5 ${meta.bandClass}`}
      />

      {/* 헤더 */}
      <div
        className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 pl-5"
        contentEditable={false}
      >
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${meta.badgeClass}`}
          aria-label={`상태: ${meta.label}`}
        >
          {meta.icon}
          {meta.label}
        </span>

        <input
          type="text"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={onTitleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="의사결정 제목"
          aria-label="의사결정 제목"
          className="flex-1 min-w-[160px] rounded-sm border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold focus:border-input focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />

        <div className="ml-auto flex items-center gap-1">
          <Select value={status} onValueChange={onStatusChange} disabled={savingStatus}>
            <SelectTrigger
              className="h-7 w-[110px] text-xs"
              aria-label="상태 변경"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Proposed">제안 (Proposed)</SelectItem>
              <SelectItem value="Accepted">승인 (Accepted)</SelectItem>
              <SelectItem value="Rejected">반려 (Rejected)</SelectItem>
              <SelectItem value="Superseded">대체 (Superseded)</SelectItem>
            </SelectContent>
          </Select>

          {savingStatus && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}

          {decisionId && (
            <Popover onOpenChange={onLogsOpenChange}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="상태 변경 이력 보기"
                >
                  <HistoryIcon className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                <div className="mb-2 text-sm font-semibold">상태 변경 이력</div>
                {logsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> 불러오는 중…
                  </div>
                ) : !logs || logs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">아직 변경 이력이 없습니다.</p>
                ) : (
                  <ul className="max-h-60 space-y-2 overflow-y-auto">
                    {logs.map((l) => (
                      <li key={l.id} className="border-b pb-1.5 last:border-0">
                        <div className="text-xs">
                          <span className="font-mono text-muted-foreground">
                            {l.fromStatus ?? '(없음)'}
                          </span>
                          <span className="mx-1">→</span>
                          <span className="font-semibold">{l.toStatus}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          @{l.changedBy} · {new Date(l.changedAt).toLocaleString('ko-KR')}
                        </div>
                        {l.note && (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            메모: {l.note}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* 본문 — children paragraphs */}
      <NodeViewContent className="px-4 py-3 pl-5 [&>p]:my-1.5" />
    </NodeViewWrapper>
  );
}
