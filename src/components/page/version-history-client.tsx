'use client';

/**
 * 버전 이력 — 비교 / 복원 UI (FR-403 / FR-404)
 *
 *  - 각 행에 비교용 체크박스(최대 2개) → [비교] 버튼 클릭 시 Diff 모달 오픈
 *  - 각 행에 [복원] 버튼 → 확인 후 PUT /versions/[versionId] action=restore
 *  - Diff 데이터는 서버 API (/diff?from=&to=) 에서 미리 계산 (큰 본문 효율화)
 */

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { GitCompareArrows, RotateCcw, Loader2, Tag, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { VersionDiff } from '@/components/page/version-diff';
import type { DiffLine } from '@/lib/diff';

export interface VersionRow {
  id: string;
  versionNo: number;
  summary: string | null;
  authorName: string;
  createdAt: string;
  label: string | null;
}

interface Props {
  pageId: string;
  versions: VersionRow[];
}

interface DiffResponse {
  from: VersionRow & { contentMarkdown: string };
  to: VersionRow & { contentMarkdown: string };
  lines: DiffLine[];
}

export function VersionHistoryClient({ pageId, versions: initialVersions }: Props) {
  const router = useRouter();
  const [versions, setVersions] = useState(initialVersions);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffData, setDiffData] = useState<DiffResponse | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [savingLabelId, setSavingLabelId] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const startLabelEdit = (v: VersionRow) => {
    setEditingLabelId(v.id);
    setLabelDraft(v.label ?? '');
  };

  const cancelLabelEdit = () => {
    setEditingLabelId(null);
    setLabelDraft('');
  };

  const saveLabel = async (v: VersionRow) => {
    const next = labelDraft.trim();
    if (next === (v.label ?? '')) {
      cancelLabelEdit();
      return;
    }
    setSavingLabelId(v.id);
    try {
      const res = await fetch(`/api/pages/${pageId}/versions/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: next || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? '라벨 저장 실패');
      setVersions((prev) =>
        prev.map((row) => (row.id === v.id ? { ...row, label: next || null } : row)),
      );
      toast({ title: next ? '라벨 저장' : '라벨 제거', description: next || `v${v.versionNo}` });
      cancelLabelEdit();
    } catch (e) {
      toast({
        title: '라벨 저장 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSavingLabelId(null);
    }
  };

  const onToggle = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        if (prev.includes(id)) return prev;
        // 최대 2개까지만
        if (prev.length >= 2) return [prev[1], id];
        return [...prev, id];
      }
      return prev.filter((p) => p !== id);
    });
  }, []);

  /** 선택된 두 버전 비교 — fromVersion < toVersion 으로 정렬 */
  const onCompare = useCallback(async () => {
    if (selectedIds.length !== 2) return;
    const [a, b] = selectedIds;
    const va = versions.find((v) => v.id === a);
    const vb = versions.find((v) => v.id === b);
    if (!va || !vb) return;
    // versionNo 오름차순 (이전 → 새것)
    const ordered = va.versionNo < vb.versionNo ? [a, b] : [b, a];
    const reqId = ++reqIdRef.current;
    setDiffOpen(true);
    setDiffLoading(true);
    setDiffData(null);
    try {
      const res = await fetch(
        `/api/pages/${pageId}/versions/diff?from=${ordered[0]}&to=${ordered[1]}`,
        { cache: 'no-store' },
      );
      const json = await res.json().catch(() => null);
      if (reqId !== reqIdRef.current) return; // 무효화
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? 'Diff 조회 실패');
      }
      setDiffData(json.data as DiffResponse);
    } catch (e) {
      toast({
        title: 'Diff 조회 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
      setDiffOpen(false);
    } finally {
      if (reqId === reqIdRef.current) setDiffLoading(false);
    }
  }, [pageId, selectedIds, versions]);

  const onRestore = useCallback(
    async (v: VersionRow) => {
      if (
        !window.confirm(
          `v${v.versionNo} (${format(new Date(v.createdAt), 'yyyy-MM-dd HH:mm')}) 로 복원하시겠습니까?\n` +
            `현재 본문은 새 버전으로 자동 백업됩니다.`,
        )
      ) {
        return;
      }
      setRestoringId(v.id);
      try {
        const res = await fetch(`/api/pages/${pageId}/versions/${v.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'restore' }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error ?? '복원 실패');
        toast({
          title: '복원 완료',
          description: `v${v.versionNo} 본문이 적용되었습니다.`,
        });
        router.refresh();
      } catch (e) {
        toast({
          title: '복원 실패',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      } finally {
        setRestoringId(null);
      }
    },
    [pageId, router],
  );

  const compareDisabled = selectedIds.length !== 2;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">버전 (FR-402) · {versions.length}건</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            비교할 버전 2개를 체크하세요 ({selectedIds.length}/2)
          </span>
          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={compareDisabled}
            onClick={onCompare}
          >
            <GitCompareArrows className="h-4 w-4" /> 비교
          </Button>
        </div>
      </div>

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          아직 저장된 버전이 없습니다. 본문을 수정하면 버전이 자동 생성됩니다.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {versions.map((v) => {
            const checked = selectedIds.includes(v.id);
            return (
              <li
                key={v.id}
                className="group flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/30"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => onToggle(v.id, !!c)}
                  aria-label={`v${v.versionNo} 비교 선택`}
                />
                <span className="font-mono text-xs text-muted-foreground">v{v.versionNo}</span>
                <span className="flex-1 min-w-[160px]">
                  {v.summary || <em className="text-muted-foreground">요약 없음</em>}
                  {editingLabelId === v.id ? (
                    <span className="ml-2 inline-flex items-center gap-1 align-middle">
                      <Input
                        value={labelDraft}
                        onChange={(e) => setLabelDraft(e.target.value)}
                        placeholder="예: v1.0 검토완료"
                        className="h-6 w-44 px-2 text-xs"
                        autoFocus
                        maxLength={80}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void saveLabel(v);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelLabelEdit();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => saveLabel(v)}
                        disabled={savingLabelId === v.id}
                        aria-label="저장"
                      >
                        {savingLabelId === v.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={cancelLabelEdit}
                        aria-label="취소"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </span>
                  ) : v.label ? (
                    <button
                      type="button"
                      onClick={() => startLabelEdit(v)}
                      className="ml-2 inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="라벨 편집"
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {v.label}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startLabelEdit(v)}
                      className="ml-2 inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0 text-[10px] text-muted-foreground/60 opacity-0 hover:bg-accent hover:text-foreground hover:opacity-100 group-hover:opacity-60"
                      title="라벨 추가 (FR-405)"
                    >
                      <Tag className="h-2.5 w-2.5" />
                      라벨
                    </button>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">@{v.authorName}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(v.createdAt), 'yyyy-MM-dd HH:mm')}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onRestore(v)}
                  disabled={restoringId !== null}
                  aria-label={`v${v.versionNo} 복원`}
                >
                  {restoringId === v.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  복원
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Diff 모달 */}
      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>버전 비교</DialogTitle>
            <DialogDescription>
              두 버전의 마크다운 본문을 줄단위로 비교합니다 (FR-403).
            </DialogDescription>
          </DialogHeader>

          {diffLoading || !diffData ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Diff 계산 중…
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto pr-1">
              <VersionDiff
                fromVersion={{
                  versionNo: diffData.from.versionNo,
                  authorName: diffData.from.authorName,
                  createdAt: diffData.from.createdAt,
                  summary: diffData.from.summary,
                }}
                toVersion={{
                  versionNo: diffData.to.versionNo,
                  authorName: diffData.to.authorName,
                  createdAt: diffData.to.createdAt,
                  summary: diffData.to.summary,
                }}
                fromMarkdown={diffData.from.contentMarkdown}
                toMarkdown={diffData.to.contentMarkdown}
                precomputedLines={diffData.lines}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDiffOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
