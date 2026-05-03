'use client';

/**
 * CommentPanel — FR-501 ~ FR-506
 *
 * 페이지 우측에 표시되는 코멘트 패널.
 * 책임:
 *  - GET /api/pages/[id]/comments 호출 → flat → tree 변환 → 렌더
 *  - 새 코멘트 작성 (textarea, @멘션 가능)
 *  - 답글 / Resolve / 삭제 / 이모지 반응 위임 → 각각 API 호출 후 로컬 상태 갱신
 *  - 'Resolved 보기' 토글
 *  - 인라인 anchor 클릭 시 onAnchorClick 호출 → 부모 페이지가 본문 스크롤/하이라이트
 *
 * 외부 이벤트 연동:
 *  - window.dispatchEvent('pi-wiki:open-comment-panel', { detail: { commentId } })
 *    → 패널이 자동으로 해당 코멘트로 스크롤
 *  - window.dispatchEvent('pi-wiki:reload-comments') → 코멘트 목록 새로고침
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MessageSquare,
  Loader2,
  RefreshCw,
  EyeOff,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { CommentThread } from './comment-thread';
import {
  buildCommentTree,
  type CommentDTO,
  type CommentNode,
} from './types';

interface Props {
  pageId: string;
  currentUser: string;
  onAnchorClick?: (commentId: string) => void;
  /** 미해결 코멘트 수가 바뀔 때 호출 (모바일 토글 배지 등에서 활용) */
  onOpenCountChange?: (count: number) => void;
  className?: string;
}

export const PANEL_OPEN_EVENT = 'pi-wiki:open-comment-panel';
export const PANEL_RELOAD_EVENT = 'pi-wiki:reload-comments';

interface PanelOpenDetail {
  commentId?: string;
}

export function CommentPanel({
  pageId,
  currentUser,
  onAnchorClick,
  onOpenCountChange,
  className,
}: Props) {
  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [newBody, setNewBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /* -------- 목록 로드 -------- */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pages/${pageId}/comments?includeResolved=true`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || '코멘트 로드 실패');
      setComments(json.data as CommentDTO[]);
    } catch (e) {
      toast({
        title: '코멘트 로드 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* -------- 외부 이벤트: 특정 코멘트로 스크롤 -------- */
  useEffect(() => {
    const onOpen = (e: Event) => {
      const ce = e as CustomEvent<PanelOpenDetail>;
      const id = ce.detail?.commentId;
      if (!id) return;
      // 다음 프레임에 스크롤 (DOM 갱신 후)
      requestAnimationFrame(() => {
        const el = itemRefs.current[id];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-primary');
          window.setTimeout(() => el.classList.remove('ring-2', 'ring-primary'), 1500);
        }
      });
    };
    const onReload = () => void load();
    window.addEventListener(PANEL_OPEN_EVENT, onOpen as EventListener);
    window.addEventListener(PANEL_RELOAD_EVENT, onReload);
    return () => {
      window.removeEventListener(PANEL_OPEN_EVENT, onOpen as EventListener);
      window.removeEventListener(PANEL_RELOAD_EVENT, onReload);
    };
  }, [load]);

  /* -------- 트리 + 필터 -------- */
  const tree = useMemo<CommentNode[]>(() => {
    const filtered = showResolved ? comments : comments.filter((c) => !c.resolved);
    return buildCommentTree(filtered);
  }, [comments, showResolved]);

  const totalCount = comments.length;
  const openCount = comments.filter((c) => !c.resolved).length;

  // 외부 (모바일 토글 배지 등) 에 미해결 카운트 알림. 값이 실제로 바뀔 때만 호출.
  const lastReportedCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (!onOpenCountChange) return;
    if (lastReportedCountRef.current === openCount) return;
    lastReportedCountRef.current = openCount;
    onOpenCountChange(openCount);
  }, [openCount, onOpenCountChange]);

  /* -------- 액션: 새 코멘트 -------- */
  const submitNew = async () => {
    const text = newBody.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/pages/${pageId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || '코멘트 등록 실패');
      setComments((prev) => [...prev, json.data as CommentDTO]);
      setNewBody('');
    } catch (e) {
      toast({
        title: '등록 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* -------- 액션: 답글 -------- */
  const onReply = useCallback(
    async (parentId: string, body: string) => {
      try {
        const res = await fetch(`/api/pages/${pageId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body, parentId }),
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || '답글 등록 실패');
        setComments((prev) => [...prev, json.data as CommentDTO]);
      } catch (e) {
        toast({
          title: '답글 등록 실패',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
        throw e;
      }
    },
    [pageId],
  );

  /* -------- 액션: Resolve 토글 -------- */
  const onResolve = useCallback(async (id: string, resolved: boolean) => {
    try {
      const res = await fetch(`/api/comments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || '상태 변경 실패');
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, resolved: json.data.resolved } : c)),
      );
    } catch (e) {
      toast({
        title: '상태 변경 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  }, []);

  /* -------- 액션: 삭제 -------- */
  const onDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/comments/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || '삭제 실패');
      setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id));
    } catch (e) {
      toast({
        title: '삭제 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  }, []);

  /* -------- 액션: 이모지 반응 토글 -------- */
  const onReact = useCallback(async (id: string, emoji: string) => {
    try {
      const res = await fetch(`/api/comments/${id}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || '반응 실패');
      const updatedReactions = json.data.reactions as Record<string, string[]> | null;
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, reactions: updatedReactions } : c)),
      );
    } catch (e) {
      toast({
        title: '이모지 반응 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  }, []);

  /* -------- 인라인 anchor 클릭 -------- */
  const handleAnchorClick = useCallback(
    (commentId: string) => {
      onAnchorClick?.(commentId);
    },
    [onAnchorClick],
  );

  /* -------- 렌더 트리 (참조 부착) -------- */
  const renderNode = (node: CommentNode) => (
    <div
      key={node.id}
      ref={(el) => {
        itemRefs.current[node.id] = el;
      }}
      className="rounded-md transition-shadow"
    >
      <CommentThread
        comment={node}
        currentUser={currentUser}
        onReply={onReply}
        onResolve={onResolve}
        onDelete={onDelete}
        onReact={onReact}
        onAnchorClick={handleAnchorClick}
      />
    </div>
  );

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-l bg-card',
        className,
      )}
      aria-label="코멘트 패널"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">코멘트</h2>
          <span className="text-xs text-muted-foreground">
            {openCount}/{totalCount}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowResolved((v) => !v)}
            title={showResolved ? '해결됨 숨기기' : '해결됨 보기'}
            aria-label={showResolved ? '해결된 코멘트 숨기기' : '해결된 코멘트 보기'}
          >
            {showResolved ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => void load()}
            title="새로고침"
            aria-label="코멘트 새로고침"
            disabled={loading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* 목록 */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {loading && tree.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 불러오는 중...
            </div>
          ) : tree.length === 0 ? (
            <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              {showResolved ? '코멘트가 없습니다.' : '진행 중인 코멘트가 없습니다.'}
            </div>
          ) : (
            tree.map((n) => renderNode(n))
          )}
        </div>
      </ScrollArea>

      {/* 새 코멘트 입력 */}
      <div className="border-t p-3">
        <Textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="@로 멘션하며 코멘트 남기기..."
          className="min-h-[80px] resize-none text-sm"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            본문에서 텍스트 선택 후 인라인 코멘트 달 수 있어요
          </span>
          <Button size="sm" onClick={submitNew} disabled={submitting || !newBody.trim()}>
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            등록
          </Button>
        </div>
      </div>
    </aside>
  );
}
