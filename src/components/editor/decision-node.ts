/**
 * Decision 블록 — TipTap Node 익스텐션 (FR-507 / FR-508)
 *
 * 본문 안에서 ADR(Architecture Decision Record) 양식을 컨테이너 노드로 표현한다.
 *  - 컨테이너 노드 (children: paragraph 가능)
 *  - 속성: decisionId, title, status
 *  - decisionId 가 null 이면 페이지 저장 시 백엔드에서 신규 생성하고 본문 JSON 에 주입.
 *
 * 마크다운 ↔ HTML 양방향 변환 (turndown / marked) 의 손실을 줄이기 위해
 * 다음 규칙을 사용한다.
 *   - HTML 직렬화 시 div[data-type="decision-block"] 에 속성을 dataset 으로 인코딩.
 *   - 본문이 마크다운으로 저장될 때는 일반 인용 블록 (<blockquote>) 으로 폴백.
 */

import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { DecisionNodeView } from './decision-node-view';

export type DecisionStatus = 'Proposed' | 'Accepted' | 'Rejected' | 'Superseded';

export interface DecisionAttrs {
  decisionId: string | null;
  title: string;
  status: DecisionStatus;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    decisionBlock: {
      insertDecisionBlock: (attrs?: Partial<DecisionAttrs>) => ReturnType;
    };
  }
}

export const DecisionNode = Node.create({
  name: 'decisionBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      decisionId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-decision-id') || null,
        renderHTML: (attrs) => {
          const v = (attrs as DecisionAttrs).decisionId;
          return v ? { 'data-decision-id': v } : {};
        },
      },
      title: {
        default: '의사결정 제목',
        parseHTML: (el) => el.getAttribute('data-title') || '의사결정 제목',
        renderHTML: (attrs) => ({ 'data-title': (attrs as DecisionAttrs).title }),
      },
      status: {
        default: 'Proposed' as DecisionStatus,
        parseHTML: (el) => (el.getAttribute('data-status') as DecisionStatus) || 'Proposed',
        renderHTML: (attrs) => ({ 'data-status': (attrs as DecisionAttrs).status }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="decision-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'decision-block',
        class: 'pi-decision-block',
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DecisionNodeView);
  },

  addCommands() {
    return {
      insertDecisionBlock:
        (attrs) =>
        ({ chain }) => {
          const finalAttrs: DecisionAttrs = {
            decisionId: attrs?.decisionId ?? null,
            title: attrs?.title ?? '의사결정 제목',
            status: attrs?.status ?? 'Proposed',
          };
          return chain()
            .insertContent({
              type: this.name,
              attrs: finalAttrs,
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '배경: ' }],
                },
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '검토 옵션: ' }],
                },
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '결정 사항: ' }],
                },
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '근거: ' }],
                },
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '담당자: @' }],
                },
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '결정일: ' }],
                },
              ],
            })
            .run();
        },
    };
  },
});
