/**
 * 마크다운 ↔ HTML 양방향 변환 — TipTap 에디터의 입출력 어댑터.
 *
 * - 마크다운 → HTML: marked v15 (GFM 활성화, syncronous 모드)
 * - HTML → 마크다운: turndown + GFM 플러그인 보조 (체크박스/표/취소선)
 *
 * 한국어 본문에서 흔한 패턴(체크박스, 표, 코드블록, 인용)을 잃지 않도록 변환 규칙을 보강.
 */

import { marked } from 'marked';
import TurndownService from 'turndown';

/* -------------------------------------------------------------------- */
/*  marked: Markdown → HTML                                              */
/* -------------------------------------------------------------------- */

marked.setOptions({
  gfm: true,
  breaks: true,
  // pedantic: false,
  // smartypants: false,
});

/** 마크다운을 HTML 로 변환. 동기 호출 — TipTap 초기화 시점에 사용. */
export function markdownToHtml(md: string): string {
  if (!md) return '';
  // marked 는 v15 에서 기본 비동기. async: false 옵션으로 동기 호출 강제.
  return marked.parse(md, { async: false }) as string;
}

/* -------------------------------------------------------------------- */
/*  turndown: HTML → Markdown                                            */
/* -------------------------------------------------------------------- */

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
});

// 1) 취소선
td.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement: (content) => `~~${content}~~`,
});

// 2) 체크박스 (TipTap task-list 가 <ul data-type="taskList"><li data-checked="true|false">… 형태로 출력)
td.addRule('taskList', {
  filter: (node) =>
    node.nodeName === 'UL' && (node as HTMLElement).getAttribute('data-type') === 'taskList',
  replacement: (_content, node) => {
    const items: string[] = [];
    (node as HTMLElement).querySelectorAll(':scope > li').forEach((li) => {
      const checked = li.getAttribute('data-checked') === 'true';
      // li 내부의 paragraph 제거하고 텍스트만
      const inner = (li as HTMLElement).innerText.trim().replace(/\n+/g, ' ');
      items.push(`- [${checked ? 'x' : ' '}] ${inner}`);
    });
    return '\n' + items.join('\n') + '\n';
  },
});

// 3) 표 (turndown 기본은 표를 못 다룸 — 간단한 구현)
td.addRule('table', {
  filter: 'table',
  replacement: (_c, node) => {
    const table = node as HTMLTableElement;
    const headers = Array.from(table.querySelectorAll('thead th')).map((th) =>
      (th.textContent || '').trim(),
    );
    const bodyRows = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').trim()),
    );

    if (headers.length === 0 && bodyRows.length === 0) return '';
    const colCount = headers.length || bodyRows[0]?.length || 1;
    const head = headers.length > 0 ? headers : Array(colCount).fill('');
    const sep = Array(colCount).fill('---');
    const lines = [
      `| ${head.join(' | ')} |`,
      `| ${sep.join(' | ')} |`,
      ...bodyRows.map((r) => `| ${r.join(' | ')} |`),
    ];
    return '\n' + lines.join('\n') + '\n';
  },
});

// 4) 하이라이트 (mark 태그)
td.addRule('highlight', {
  filter: 'mark',
  replacement: (content) => `==${content}==`,
});

// 5) 첨부 이미지 — alt 가 비어있고 src 가 /api/attachments/ 로 시작하면 마크다운 이미지로
td.addRule('attachmentImg', {
  filter: (node) =>
    node.nodeName === 'IMG' &&
    ((node as HTMLImageElement).getAttribute('src') || '').startsWith('/api/attachments/'),
  replacement: (_c, node) => {
    const img = node as HTMLImageElement;
    const alt = img.getAttribute('alt') || '';
    const src = img.getAttribute('src') || '';
    return `![${alt}](${src})`;
  },
});

/** HTML 을 마크다운으로 변환. */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  return td.turndown(html).trim();
}
