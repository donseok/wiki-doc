'use client';

/**
 * CommentToolbar — FR-502 본문 인라인 코멘트 추가 버튼
 *
 * TipTap 에디터에서 텍스트 선택 시 떠오르는 floating toolbar.
 * @tiptap/extension-bubble-menu 미설치 — 자체 구현.
 *
 * 동작:
 *  - editor.on('selectionUpdate') 로 선택 영역 감시
 *  - 비어있지 않은 텍스트 선택 → 선택 영역 좌표 위에 [코멘트] 버튼 표시
 *  - 클릭 → onAddComment(quote, range) 호출
 */

import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { MessageSquarePlus } from 'lucide-react';

interface Props {
  editor: Editor | null;
  /** 선택된 텍스트와 ProseMirror 위치를 받아 인라인 코멘트 작성 흐름을 시작 */
  onAddComment: (range: { from: number; to: number; quote: string }) => void;
}

export function CommentToolbar({ editor, onAddComment }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;

    const update = () => {
      const sel = editor.state.selection;
      if (sel.empty) {
        setPos(null);
        return;
      }
      const text = editor.state.doc.textBetween(sel.from, sel.to, ' ');
      if (!text || !text.trim()) {
        setPos(null);
        return;
      }
      // DOM 좌표 계산
      try {
        const from = editor.view.coordsAtPos(sel.from);
        const to = editor.view.coordsAtPos(sel.to);
        const top = Math.min(from.top, to.top) - 40;
        const left = (Math.min(from.left, to.left) + Math.max(from.right, to.right)) / 2;
        setPos({ top: Math.max(top, 8), left });
      } catch {
        setPos(null);
      }
    };

    const onBlur = () => {
      // 살짝 지연: toolbar 클릭은 보존
      window.setTimeout(() => {
        if (!ref.current?.matches(':hover')) setPos(null);
      }, 150);
    };

    editor.on('selectionUpdate', update);
    editor.on('blur', onBlur);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('blur', onBlur);
    };
  }, [editor]);

  if (!editor || !pos) return null;

  const handleClick = () => {
    const sel = editor.state.selection;
    if (sel.empty) return;
    const quote = editor.state.doc.textBetween(sel.from, sel.to, ' ').slice(0, 500);
    onAddComment({ from: sel.from, to: sel.to, quote });
    setPos(null);
  };

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        transform: 'translateX(-50%)',
        zIndex: 60,
      }}
      className="flex items-center gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      onMouseDown={(e) => e.preventDefault()} // 선택 유지
    >
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs hover:bg-accent"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        코멘트 추가
      </button>
    </div>
  );
}
