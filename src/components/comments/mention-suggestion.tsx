'use client';

/**
 * Mention 자동완성 — FR-504
 *
 * @tiptap/extension-mention 의 suggestion 옵션 객체.
 * - items: /api/users 호출하여 후보 반환
 * - render: ReactDOM root 를 사용하지 않고 직접 div 를 만들어 list 렌더 (의존성 최소화)
 * - 키보드: ↑/↓/Enter/Esc 처리
 *
 * 자유 입력 가능 (Sprint 1 인증 미적용) — Esc/Space 입력 시 그대로 단순 텍스트로 남는다.
 */

import type { Editor, Range } from '@tiptap/core';
import type { SuggestionOptions } from '@tiptap/suggestion';
import type { MentionNodeAttrs } from '@tiptap/extension-mention';

interface UserItem {
  name: string;
  lastSeenAt: string | null;
}

let abortCtrl: AbortController | null = null;

async function fetchUsers(query: string): Promise<UserItem[]> {
  abortCtrl?.abort();
  abortCtrl = new AbortController();
  try {
    const res = await fetch(
      `/api/users?q=${encodeURIComponent(query)}&limit=8`,
      { cache: 'no-store', signal: abortCtrl.signal },
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (!json?.ok) return [];
    return json.data as UserItem[];
  } catch {
    return [];
  }
}

/* ------------------------------ DOM 렌더러 ------------------------------ */

interface PopupState {
  el: HTMLDivElement;
  selected: number;
  items: UserItem[];
  command: (props: MentionNodeAttrs) => void;
}

function createPopup(): HTMLDivElement {
  const el = document.createElement('div');
  el.className =
    'pi-mention-popup z-[70] min-w-[180px] max-w-[260px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md';
  el.style.position = 'fixed';
  el.style.display = 'none';
  document.body.appendChild(el);
  return el;
}

function renderItems(state: PopupState) {
  if (state.items.length === 0) {
    state.el.innerHTML = `<div class="px-3 py-2 text-xs text-muted-foreground">일치하는 사용자가 없습니다. (Esc 로 닫기)</div>`;
    return;
  }
  state.el.innerHTML = state.items
    .map(
      (it, i) => `
      <button type="button" data-index="${i}" class="pi-mention-item flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
        i === state.selected ? 'bg-accent text-accent-foreground' : ''
      } hover:bg-accent">
        <span class="truncate">@${escapeHtml(it.name)}</span>
        ${
          it.lastSeenAt
            ? `<span class="ml-2 shrink-0 text-[10px] text-muted-foreground">활동</span>`
            : ''
        }
      </button>`,
    )
    .join('');
  // 클릭 핸들러
  Array.from(state.el.querySelectorAll<HTMLButtonElement>('.pi-mention-item')).forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const i = Number(btn.dataset.index ?? '0');
      const item = state.items[i];
      if (item) state.command({ id: item.name, label: item.name });
    });
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function positionPopup(el: HTMLElement, rect: DOMRect | null) {
  if (!rect) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.style.top = `${rect.bottom + 4}px`;
  el.style.left = `${rect.left}px`;
}

/* --------------------------- Suggestion config --------------------------- */

export const mentionSuggestion: Omit<SuggestionOptions<UserItem, MentionNodeAttrs>, 'editor'> = {
  char: '@',
  allowSpaces: false,

  items: async ({ query }) => {
    return fetchUsers(query);
  },

  command: ({ editor, range, props }: { editor: Editor; range: Range; props: MentionNodeAttrs }) => {
    // 멘션 노드 + trailing space 삽입
    editor
      .chain()
      .focus()
      .insertContentAt(range, [
        {
          type: 'mention',
          attrs: { id: props.id, label: props.label ?? props.id },
        },
        { type: 'text', text: ' ' },
      ])
      .run();
  },

  render: () => {
    let state: PopupState | null = null;

    return {
      onStart: (props) => {
        const el = createPopup();
        state = {
          el,
          selected: 0,
          items: props.items as UserItem[],
          command: props.command as (p: MentionNodeAttrs) => void,
        };
        renderItems(state);
        positionPopup(el, props.clientRect?.() ?? null);
      },
      onUpdate: (props) => {
        if (!state) return;
        state.items = props.items as UserItem[];
        state.command = props.command as (p: MentionNodeAttrs) => void;
        if (state.selected >= state.items.length) state.selected = 0;
        renderItems(state);
        positionPopup(state.el, props.clientRect?.() ?? null);
      },
      onKeyDown: (props) => {
        if (!state) return false;
        const key = props.event.key;
        if (key === 'ArrowDown') {
          state.selected = (state.selected + 1) % Math.max(state.items.length, 1);
          renderItems(state);
          return true;
        }
        if (key === 'ArrowUp') {
          state.selected =
            (state.selected - 1 + Math.max(state.items.length, 1)) %
            Math.max(state.items.length, 1);
          renderItems(state);
          return true;
        }
        if (key === 'Enter') {
          const item = state.items[state.selected];
          if (item) {
            state.command({ id: item.name, label: item.name });
            return true;
          }
        }
        if (key === 'Escape') {
          state.el.style.display = 'none';
          return true;
        }
        return false;
      },
      onExit: () => {
        if (!state) return;
        state.el.remove();
        state = null;
      },
    };
  },
};
