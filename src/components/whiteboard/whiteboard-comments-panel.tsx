'use client';

/**
 * 화이트보드 코멘트 패널 — FR-1211
 *
 * 페이지 코멘트와 동일 모델(Comment) 재사용. 표시 위치만 화이트보드 사이드.
 * 인라인 핀 형태(좌표 anchor) 는 추후 — 1차에서는 사이드 패널 + 평면 목록만.
 */

import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, X, CheckCircle2, Trash2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface CommentRow {
  id: string;
  whiteboardId: string;
  parentId: string | null;
  body: string;
  authorName: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  anchorRange: { kind?: string; x?: number; y?: number; shapeId?: string } | null;
}

interface Props {
  whiteboardId: string;
  currentUser: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WhiteboardCommentsPanel({ whiteboardId, currentUser, open, onOpenChange }: Props) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [posting, setPosting] = useState(false);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/whiteboards/${whiteboardId}/comments`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok && Array.isArray(json.data)) {
        setComments(json.data as CommentRow[]);
      }
    } finally {
      setLoading(false);
    }
  }, [whiteboardId]);

  useEffect(() => {
    if (open) void fetchComments();
  }, [open, fetchComments]);

  const visibleComments = showResolved ? comments : comments.filter((c) => !c.resolved);
  const unresolvedCount = comments.filter((c) => !c.resolved).length;

  const submit = async () => {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/whiteboards/${whiteboardId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? '저장 실패');
      setDraft('');
      setComments((prev) => [...prev, json.data as CommentRow]);
      toast({ title: '코멘트 추가' });
    } catch (e) {
      toast({
        title: '코멘트 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setPosting(false);
    }
  };

  const toggleResolve = async (c: CommentRow) => {
    const res = await fetch(`/api/comments/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved: !c.resolved }),
    });
    if (res.ok) {
      setComments((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, resolved: !c.resolved } : x)),
      );
    }
  };

  const remove = async (c: CommentRow) => {
    if (!window.confirm('이 코멘트를 삭제할까요?')) return;
    const res = await fetch(`/api/comments/${c.id}`, { method: 'DELETE' });
    if (res.ok) {
      setComments((prev) => prev.filter((x) => x.id !== c.id));
    }
  };

  if (!open) return null;

  return (
    <aside className="absolute right-0 top-0 z-30 flex h-full w-[340px] flex-col border-l bg-card shadow-elevated">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">코멘트</h3>
          {unresolvedCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              {unresolvedCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowResolved((s) => !s)}
            className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
          >
            {showResolved ? '해결 숨기기' : '해결도 보기'}
          </button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {loading && comments.length === 0 && (
            <p className="text-xs text-muted-foreground">로딩 중...</p>
          )}
          {!loading && visibleComments.length === 0 && (
            <div className="rounded-lg border border-dashed bg-background/50 p-4 text-center text-xs text-muted-foreground">
              아직 코멘트가 없습니다.
              <br />
              아래에서 첫 코멘트를 작성해 보세요.
            </div>
          )}
          {visibleComments.map((c) => (
            <div
              key={c.id}
              className={cn(
                'group rounded-lg border bg-background p-2.5 text-sm transition-opacity',
                c.resolved && 'opacity-60',
              )}
            >
              <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">@{c.authorName}</span>
                <span>·</span>
                <span>{format(new Date(c.createdAt), 'MM-dd HH:mm')}</span>
                {c.anchorRange?.kind === 'whiteboard-shape' && (
                  <span className="rounded bg-accent px-1 text-[9px]">
                    🎯 {c.anchorRange.shapeId?.slice(0, 8)}
                  </span>
                )}
                {c.resolved && (
                  <span className="rounded bg-emerald-100 px-1 text-[9px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    해결됨
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words leading-snug">{c.body}</p>
              <div className="mt-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => toggleResolve(c)}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  {c.resolved ? '되돌리기' : '해결'}
                </button>
                {c.authorName === currentUser && (
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                    삭제
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t p-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="코멘트 작성  (Ctrl+Enter 로 등록)"
          className="min-h-[60px] resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="mt-1.5 flex justify-end">
          <Button size="sm" onClick={submit} disabled={!draft.trim() || posting}>
            <Send className="h-3.5 w-3.5" />
            등록
          </Button>
        </div>
      </div>
    </aside>
  );
}
