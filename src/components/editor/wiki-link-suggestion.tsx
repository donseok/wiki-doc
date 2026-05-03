'use client';

/**
 * 위키 링크 자동완성 — FR-206
 *
 * 본문에서 `[[` 입력 시 페이지 자동완성 popup 출력.
 * 선택 시 Link mark + 텍스트로 삽입. (Mention 노드와 달리 일반 링크처럼 동작)
 *
 * 사용:
 *   import { WikiLinkSuggestion } from './wiki-link-suggestion';
 *   ...
 *   extensions: [..., WikiLinkSuggestion]
 */

import { Extension } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';

interface PageItem {
  id: string;
  title: string;
  icon?: string | null;
}

let abortCtrl: AbortController | null = null;

async function fetchPages(query: string): Promise<PageItem[]> {
  abortCtrl?.abort();
  abortCtrl = new AbortController();
  try {
    // 트리에서 page 타입만 추출 — Sprint 2 의 /api/tree 응답 활용
    const res = await fetch('/api/tree', {
      cache: 'no-store',
      signal: abortCtrl.signal,
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (!json?.ok || !Array.isArray(json.data)) return [];

    const pages = (json.data as Array<{ id: string; type: string; title: string; icon: string | null; page?: { id?: string } | null }>)
      .filter((n) => n.type === 'page')
      .map((n) => ({ id: n.id, title: n.title, icon: n.icon }));

    if (!query) return pages.slice(0, 10);
    const q = query.toLowerCase();
    return pages
      .filter((p) => p.title.toLowerCase().includes(q))
      .slice(0, 10);
  } catch {
    return [];
  }
}

/* ------------------------------ DOM 렌더러 ------------------------------ */

interface PopupState {
  el: HTMLDivElement;
  selected: number;
  items: PageItem[];
  command: (item: PageItem) => void;
}

function createPopup(): HTMLDivElement {
  const el = document.createElement('div');
  el.className =
    'pi-wiki-link-popup z-[70] min-w-[240px] max-w-[360px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md';
  el.style.position = 'fixed';
  el.style.display = 'none';
  document.body.appendChild(el);
  return el;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderItems(state: PopupState) {
  if (state.items.length === 0) {
    state.el.innerHTML = `<div class="px-3 py-2 text-xs text-muted-foreground">일치하는 페이지 없음 (Esc 로 닫기)</div>`;
    return;
  }
  state.el.innerHTML = `
    <div class="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">위키 링크</div>
    ${state.items
      .map(
        (it, i) => `
      <button type="button" data-index="${i}" class="pi-wiki-link-item flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
        i === state.selected ? 'bg-accent text-accent-foreground' : ''
      } hover:bg-accent">
        <span>${escapeHtml(it.icon || '📄')}</span>
        <span class="flex-1 truncate">${escapeHtml(it.title)}</span>
      </button>`,
      )
      .join('')}
  `;
  Array.from(state.el.querySelectorAll<HTMLButtonElement>('.pi-wiki-link-item')).forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const i = Number(btn.dataset.index ?? '0');
      const item = state.items[i];
      if (item) state.command(item);
    });
  });
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

/* --------------------------- Extension --------------------------- */

export const WikiLinkSuggestion = Extension.create({
  name: 'wikiLinkSuggestion',

  addOptions() {
    const options: Omit<SuggestionOptions<PageItem, PageItem>, 'editor'> = {
      char: '[[',
      allowSpaces: true,
      decorationTag: 'span',
      decorationClass: 'pi-wiki-link-active',
      pluginKey: undefined,

      items: async ({ query }) => fetchPages(query),

      command: ({ editor, range, props }) => {
        // 닫는 ]] 가 입력된 상태일 수 있음 — 해당 부분도 함께 제거
        const docText = editor.state.doc.textBetween(range.to, Math.min(editor.state.doc.content.size, range.to + 2));
        const extra = docText.startsWith(']]') ? 2 : 0;

        editor
          .chain()
          .focus()
          .deleteRange({ from: range.from, to: range.to + extra })
          .insertContent([
            {
              type: 'text',
              text: props.title,
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: `/pages/${props.id}`,
                    target: null,
                    rel: null,
                    class: 'pi-wiki-link',
                  },
                },
              ],
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
              items: props.items as PageItem[],
              command: props.command as (p: PageItem) => void,
            };
            renderItems(state);
            positionPopup(el, props.clientRect?.() ?? null);
          },
          onUpdate: (props) => {
            if (!state) return;
            state.items = props.items as PageItem[];
            state.command = props.command as (p: PageItem) => void;
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
                state.command(item);
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
    return { suggestion: options };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...(this.options as { suggestion: Omit<SuggestionOptions<PageItem, PageItem>, 'editor'> }).suggestion,
      }),
    ];
  },
});
