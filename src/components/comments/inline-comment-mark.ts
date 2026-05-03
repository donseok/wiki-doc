/**
 * InlineCommentMark — FR-502 본문 인라인 코멘트
 *
 * TipTap Mark 익스텐션. 텍스트 범위에 commentId 속성을 부여한다.
 *
 * 외관:
 *   - resolved=false: 노란 형광펜 (배경 yellow-200)
 *   - resolved=true: 회색 (배경 muted)
 *
 * 동작:
 *   - mark 가 적용된 텍스트 클릭 시 window CustomEvent('pi-wiki:comment-anchor-click', { commentId })
 *     발생 → 부모 페이지가 listen 하여 패널 스크롤/하이라이트 처리.
 *
 * 사용법:
 *   editor.chain().focus().setMark('inlineComment', { commentId: 'xxx', resolved: false }).run()
 *   editor.chain().focus().unsetMark('inlineComment').run()
 *
 * 클릭 핸들러는 ProseMirror handleClick 으로 처리한다. (mark 클릭 감지)
 */

import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const INLINE_COMMENT_CLICK_EVENT = 'pi-wiki:comment-anchor-click';

export interface InlineCommentClickDetail {
  commentId: string;
}

export interface InlineCommentMarkOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineComment: {
      setInlineComment: (attrs: { commentId: string; resolved?: boolean }) => ReturnType;
      unsetInlineComment: () => ReturnType;
    };
  }
}

export const InlineCommentMark = Mark.create<InlineCommentMarkOptions>({
  name: 'inlineComment',
  inclusive: false,
  spanning: true,
  exitable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-comment-id'),
        renderHTML: (attrs) => {
          if (!attrs.commentId) return {};
          return { 'data-comment-id': attrs.commentId };
        },
      },
      resolved: {
        default: false,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-resolved') === 'true',
        renderHTML: (attrs) => ({ 'data-resolved': attrs.resolved ? 'true' : 'false' }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-comment-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const resolved = HTMLAttributes['data-resolved'] === 'true';
    const cls = resolved
      ? 'pi-comment-mark pi-comment-mark--resolved bg-muted text-muted-foreground rounded px-0.5 cursor-pointer'
      : 'pi-comment-mark bg-yellow-200/70 hover:bg-yellow-300/70 text-yellow-950 rounded px-0.5 cursor-pointer';
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: cls,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setInlineComment:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs);
        },
      unsetInlineComment:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },

  /**
   * 마크 클릭 시 CustomEvent 발생.
   * ProseMirror Plugin 의 handleClick 으로 클릭된 위치의 mark 를 검사.
   */
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('inlineCommentClick'),
        props: {
          handleClick: (view, pos) => {
            const node = view.state.doc.nodeAt(pos);
            if (!node) return false;
            const mark = node.marks.find((m) => m.type.name === 'inlineComment');
            if (!mark) return false;
            const commentId = mark.attrs.commentId as string | null;
            if (!commentId) return false;
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent<InlineCommentClickDetail>(INLINE_COMMENT_CLICK_EVENT, {
                  detail: { commentId },
                }),
              );
            }
            return false; // 텍스트 선택을 막지 않음
          },
        },
      }),
    ];
  },
});
