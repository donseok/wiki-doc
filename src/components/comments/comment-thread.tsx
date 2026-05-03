'use client';

/**
 * CommentThread — 단일 코멘트 + 답글 스레드
 *
 * 표시 요소:
 *  - 작성자 / 시간 / 인라인 anchor 인용 / 본문(@멘션 하이라이트)
 *  - 이모지 반응 행 (FR-506) — 클릭 토글
 *  - 액션: 답글, Resolve(루트만), 삭제, 인라인 anchor 클릭 시 본문으로 이동
 *  - replies 재귀 렌더 (시각적 들여쓰기 1단계만; 그 이상은 평면화)
 */

import { useMemo, useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  CornerUpLeft,
  Check,
  RotateCcw,
  Trash2,
  Smile,
  MessageSquareQuote,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { EMOJI_PALETTE, type CommentNode } from './types';

interface Props {
  comment: CommentNode;
  currentUser: string;
  depth?: number;
  onReply: (parentId: string, body: string) => Promise<void>;
  onResolve: (id: string, resolved: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReact: (id: string, emoji: string) => Promise<void>;
  onAnchorClick?: (commentId: string) => void;
}

function formatRelative(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: ko });
  } catch {
    return iso;
  }
}

/** @멘션 하이라이트 */
function renderBody(body: string): React.ReactNode {
  const parts = body.split(/(@[\w가-힣.\-_]+)/g);
  return parts.map((part, i) =>
    /^@[\w가-힣.\-_]+$/.test(part) ? (
      <span
        key={i}
        className="rounded bg-primary/10 px-1 font-medium text-primary"
      >
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function CommentThread({
  comment,
  currentUser,
  depth = 0,
  onReply,
  onResolve,
  onDelete,
  onReact,
  onAnchorClick,
}: Props) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isRoot = depth === 0;
  const isMine = comment.authorName === currentUser;
  const reactionEntries = useMemo(
    () => Object.entries(comment.reactions ?? {}).filter(([, users]) => users.length > 0),
    [comment.reactions],
  );

  const submitReply = async () => {
    const text = replyText.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      await onReply(comment.id, text);
      setReplyText('');
      setReplyOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-md border bg-card p-3 text-sm',
        comment.resolved && 'opacity-70',
        depth > 0 && 'border-l-2 border-l-primary/30',
      )}
    >
      {/* 헤더: 작성자 / 시간 / Resolved 배지 */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-foreground">@{comment.authorName}</span>
          <span className="text-muted-foreground">{formatRelative(comment.createdAt)}</span>
          {comment.resolved && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              해결됨
            </span>
          )}
        </div>
      </div>

      {/* 인라인 anchor 인용 */}
      {comment.anchorRange?.quote && (
        <button
          type="button"
          onClick={() => onAnchorClick?.(comment.id)}
          className="mb-2 flex w-full items-start gap-1.5 rounded-sm border-l-2 border-yellow-400 bg-yellow-50 px-2 py-1 text-left text-xs text-yellow-950 hover:bg-yellow-100 dark:bg-yellow-950/30 dark:text-yellow-200 dark:hover:bg-yellow-950/50"
          title="본문에서 보기"
        >
          <MessageSquareQuote className="mt-0.5 h-3 w-3 shrink-0 opacity-70" />
          <span className="line-clamp-2 italic">{comment.anchorRange.quote}</span>
        </button>
      )}

      {/* 본문 */}
      <div className="whitespace-pre-wrap break-words text-foreground">
        {renderBody(comment.body)}
      </div>

      {/* 이모지 반응 */}
      {reactionEntries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {reactionEntries.map(([emoji, users]) => {
            const mine = users.includes(currentUser);
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(comment.id, emoji)}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                  mine
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-accent',
                )}
                title={users.join(', ')}
              >
                <span>{emoji}</span>
                <span className="font-mono">{users.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 액션 행 */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {/* 이모지 추가 팝오버 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <Smile className="h-3.5 w-3.5" />
              반응
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-1" align="start">
            <div className="flex gap-0.5">
              {EMOJI_PALETTE.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onReact(comment.id, e)}
                  className="rounded p-1.5 text-base hover:bg-accent"
                  title={e}
                >
                  {e}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setReplyOpen((v) => !v)}
        >
          <CornerUpLeft className="h-3.5 w-3.5" />
          답글
        </Button>

        {isRoot && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onResolve(comment.id, !comment.resolved)}
          >
            {comment.resolved ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                재오픈
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                해결
              </>
            )}
          </Button>
        )}

        {isMine && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            onClick={() => {
              if (window.confirm('이 코멘트를 삭제하시겠어요? 답글도 함께 삭제됩니다.')) {
                void onDelete(comment.id);
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            삭제
          </Button>
        )}
      </div>

      {/* 답글 입력 */}
      {replyOpen && (
        <div className="mt-2 space-y-2">
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="답글 작성... (@로 멘션)"
            className="min-h-[60px] text-sm"
            autoFocus
          />
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setReplyOpen(false);
                setReplyText('');
              }}
              disabled={submitting}
            >
              취소
            </Button>
            <Button size="sm" onClick={submitReply} disabled={submitting || !replyText.trim()}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              등록
            </Button>
          </div>
        </div>
      )}

      {/* 답글 목록 */}
      {comment.replies.length > 0 && (
        <div className="mt-3 space-y-2 pl-3">
          {comment.replies.map((r) => (
            <CommentThread
              key={r.id}
              comment={r}
              currentUser={currentUser}
              depth={depth + 1}
              onReply={onReply}
              onResolve={onResolve}
              onDelete={onDelete}
              onReact={onReact}
              onAnchorClick={onAnchorClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
