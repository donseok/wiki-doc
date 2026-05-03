/**
 * 버전 Diff 유틸 — FR-403 / FR-404
 *
 * `diff` 패키지의 diffLines() 결과를 UI 가 쉽게 렌더링할 수 있는 단일 배열로 변환한다.
 *  - 추가/삭제/유지(unchanged) 3종으로 정규화
 *  - 큰 본문에서 unchanged 줄이 많을 때, 컨텍스트 N 줄만 보여주고 중간을 "… N 줄 동일 …" 로
 *    축약하는 collapseUnchanged 옵션 제공
 *
 * 본 모듈은 client/server 양쪽에서 사용 가능 (diff 패키지는 isomorphic).
 */

import { diffLines, type Change } from 'diff';

export type DiffLineType = 'added' | 'removed' | 'unchanged' | 'context-skip';

export interface DiffLine {
  type: DiffLineType;
  /** 줄 텍스트 (context-skip 의 경우 메시지) */
  line: string;
  /** 좌측(원본) 줄 번호 — added 인 경우 null */
  leftNo: number | null;
  /** 우측(대상) 줄 번호 — removed 인 경우 null */
  rightNo: number | null;
}

export interface DiffOptions {
  /** unchanged 컨텍스트 N 줄 + 양 끝만 노출 (기본: 0 = 모두 보임) */
  collapseUnchanged?: number;
  /** 공백 차이 무시 */
  ignoreWhitespace?: boolean;
  /** 대소문자 무시 */
  ignoreCase?: boolean;
}

/**
 * 두 마크다운 본문을 줄단위로 비교해 표시용 배열로 변환한다.
 */
export function diffMarkdown(
  before: string,
  after: string,
  opts: DiffOptions = {},
): DiffLine[] {
  const changes: Change[] = diffLines(before ?? '', after ?? '', {
    ignoreWhitespace: opts.ignoreWhitespace,
    ignoreCase: opts.ignoreCase,
  });

  const lines: DiffLine[] = [];
  let leftNo = 1;
  let rightNo = 1;

  for (const change of changes) {
    // 마지막 빈 줄 제거 (split 부산물)
    const raw = change.value.endsWith('\n')
      ? change.value.slice(0, -1)
      : change.value;
    const parts = raw.split('\n');
    for (const ln of parts) {
      if (change.added) {
        lines.push({ type: 'added', line: ln, leftNo: null, rightNo });
        rightNo += 1;
      } else if (change.removed) {
        lines.push({ type: 'removed', line: ln, leftNo, rightNo: null });
        leftNo += 1;
      } else {
        lines.push({ type: 'unchanged', line: ln, leftNo, rightNo });
        leftNo += 1;
        rightNo += 1;
      }
    }
  }

  // unchanged 축약
  const ctx = opts.collapseUnchanged ?? 0;
  if (ctx <= 0) return lines;
  return collapseUnchangedRuns(lines, ctx);
}

function collapseUnchangedRuns(lines: DiffLine[], ctx: number): DiffLine[] {
  const out: DiffLine[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type !== 'unchanged') {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    // unchanged 시작점 — 끝까지 길이 측정
    let j = i;
    while (j < lines.length && lines[j].type === 'unchanged') j += 1;
    const runLen = j - i;
    // 시작/끝 컨텍스트 외부 영역만 축약
    const isFirst = i === 0;
    const isLast = j === lines.length;
    const headKeep = isFirst ? 0 : ctx;
    const tailKeep = isLast ? 0 : ctx;
    if (runLen <= headKeep + tailKeep) {
      // 축약 불필요
      for (let k = i; k < j; k++) out.push(lines[k]);
    } else {
      for (let k = i; k < i + headKeep; k++) out.push(lines[k]);
      out.push({
        type: 'context-skip',
        line: `… ${runLen - headKeep - tailKeep}줄 동일 …`,
        leftNo: null,
        rightNo: null,
      });
      for (let k = j - tailKeep; k < j; k++) out.push(lines[k]);
    }
    i = j;
  }
  return out;
}

/**
 * 변경 통계 요약 — 헤더에 "+12 -3" 형태로 표시.
 */
export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.type === 'added') added += 1;
    else if (l.type === 'removed') removed += 1;
  }
  return { added, removed };
}
