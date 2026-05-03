'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, X, Filter, History } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/page/status-badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { PageStatus } from '@/types';

interface SearchHit {
  id: string;
  treeNodeId: string;
  title: string;
  snippet: string;
  status: PageStatus;
  authorName: string;
  updatedAt: string;
  matchType: 'title' | 'body' | 'tag' | 'attachment';
  matchedAttachments?: { id: string; filename: string }[];
  score?: number;
}

interface TagOption {
  id: string;
  name: string;
}
interface SpaceOption {
  id: string;
  title: string;
}

const MATCH_LABEL: Record<SearchHit['matchType'], string> = {
  title: '제목 일치',
  body: '본문 일치',
  tag: '태그 일치',
  attachment: '첨부 파일명 일치',
};

const SORT_OPTIONS: Array<{ value: 'relevance' | 'recent' | 'title'; label: string }> = [
  { value: 'relevance', label: '관련도순' },
  { value: 'recent',    label: '최신순' },
  { value: 'title',     label: '제목순' },
];

const RECENT_KEY = 'pi-wiki:recent-searches';
const RECENT_LIMIT = 8;

function loadRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecent(term: string): string[] {
  if (typeof window === 'undefined' || !term.trim()) return [];
  const next = [term, ...loadRecent().filter((t) => t !== term)].slice(0, RECENT_LIMIT);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

function clearRecent() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(RECENT_KEY);
}

export function SearchView() {
  const sp = useSearchParams();
  const router = useRouter();

  const initialQ = sp.get('q') || '';
  const initialStatus = (sp.get('status') as PageStatus) || '';
  const initialTag = sp.get('tag') || '';
  const initialSpace = sp.get('space') || '';
  const initialFrom = sp.get('fromDate') || '';
  const initialTo = sp.get('toDate') || '';
  const initialSort = (sp.get('sort') as 'relevance' | 'recent' | 'title') || 'relevance';

  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState<string>(initialStatus);
  const [tag, setTag] = useState(initialTag);
  const [space, setSpace] = useState(initialSpace);
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);
  const [sort, setSort] = useState<typeof initialSort>(initialSort);

  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [recentOpen, setRecentOpen] = useState(false);

  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [spaceOptions, setSpaceOptions] = useState<SpaceOption[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  // 최초 로드: 메타 (태그/스페이스) + 최근 검색어
  useEffect(() => {
    setRecent(loadRecent());
    fetch('/api/tags')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.data)) {
          setTagOptions(j.data.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
        }
      })
      .catch(() => undefined);
    fetch('/api/tree')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.data)) {
          setSpaceOptions(
            j.data
              .filter(
                (n: { type: string; parentId: string | null }) =>
                  n.type === 'folder' && n.parentId === null,
              )
              .map((n: { id: string; title: string }) => ({ id: n.id, title: n.title })),
          );
        }
      })
      .catch(() => undefined);
  }, []);

  const buildUrl = (override: Partial<Record<string, string>> = {}) => {
    const url = new URL('/api/search', window.location.origin);
    const merged: Record<string, string> = {
      q: q.trim(),
      status,
      tag,
      space,
      fromDate,
      toDate,
      sort,
      ...override,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) url.searchParams.set(k, v);
    }
    return url;
  };

  const run = async () => {
    if (!q.trim() && !status && !tag && !space && !fromDate && !toDate) {
      setHits([]);
      return;
    }
    setLoading(true);
    setRecentOpen(false);
    try {
      const url = buildUrl();
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) setHits(json.data);
      if (q.trim()) setRecent(pushRecent(q.trim()));

      // URL 동기화 (북마크 가능)
      const browserUrl = new URL(window.location.pathname, window.location.origin);
      url.searchParams.forEach((v, k) => browserUrl.searchParams.set(k, v));
      router.replace(`${browserUrl.pathname}?${browserUrl.searchParams.toString()}`);
    } finally {
      setLoading(false);
    }
  };

  // URL 파라미터 변경 시 자동 검색 (초기 진입 / 뒤로가기)
  useEffect(() => {
    if (initialQ || initialStatus || initialTag || initialSpace || initialFrom || initialTo) {
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeFilterCount =
    [status, tag, space, fromDate, toDate].filter(Boolean).length + (sort !== 'relevance' ? 1 : 0);

  const reset = () => {
    setStatus('');
    setTag('');
    setSpace('');
    setFromDate('');
    setToDate('');
    setSort('relevance');
  };

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (q) parts.push(`"${q}"`);
    if (status) parts.push(`상태=${status}`);
    if (tag) parts.push(`#${tag}`);
    if (space) {
      const s = spaceOptions.find((o) => o.id === space);
      parts.push(`스페이스=${s?.title ?? space}`);
    }
    if (fromDate || toDate) parts.push(`기간=${fromDate || '...'}~${toDate || '...'}`);
    if (sort !== 'relevance') parts.push(`정렬=${SORT_OPTIONS.find((s) => s.value === sort)?.label}`);
    return parts.join(' · ');
  }, [q, status, tag, space, fromDate, toDate, sort, spaceOptions]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-2xl font-bold">검색</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        className="mb-3 flex flex-wrap items-center gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setRecentOpen(true)}
            onBlur={() => setTimeout(() => setRecentOpen(false), 150)}
            placeholder="검색어"
            className="pl-9"
          />

          {/* FR-306 — 최근 검색어 (입력 비어있을 때만) */}
          {recentOpen && !q && recent.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <History className="h-3 w-3" /> 최근 검색
                </span>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    clearRecent();
                    setRecent([]);
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  전체 삭제
                </button>
              </div>
              <ul>
                {recent.map((term) => (
                  <li key={term}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setQ(term);
                        setRecentOpen(false);
                        // 비동기로 다음 tick 에 검색
                        setTimeout(() => {
                          void run();
                        }, 0);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <Search className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate">{term}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="gap-1.5">
              <Filter className="h-4 w-4" />
              필터
              {activeFilterCount > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">상태</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="h-8 w-full rounded border bg-background px-2 text-sm"
                >
                  <option value="">전체</option>
                  <option value="Draft">초안</option>
                  <option value="Review">검토</option>
                  <option value="Approved">승인</option>
                  <option value="Pending">보류</option>
                  <option value="Archived">보관</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">태그</Label>
                <Input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="태그 이름"
                  list="search-tag-list"
                  className="h-8"
                />
                <datalist id="search-tag-list">
                  {tagOptions.map((t) => (
                    <option key={t.id} value={t.name} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">스페이스 (최상위 폴더)</Label>
                <select
                  value={space}
                  onChange={(e) => setSpace(e.target.value)}
                  className="h-8 w-full rounded border bg-background px-2 text-sm"
                >
                  <option value="">전체</option>
                  {spaceOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">시작일 (수정일 기준)</Label>
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">종료일</Label>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="h-8"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={reset} className="h-7">
                  필터 초기화
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          title="정렬"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <Button type="submit">검색</Button>
      </form>

      {/* 활성 필터 chip 표시 */}
      {(status || tag || space || fromDate || toDate || sort !== 'relevance') && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
          {status && (
            <FilterChip onRemove={() => setStatus('')}>상태: {status}</FilterChip>
          )}
          {tag && <FilterChip onRemove={() => setTag('')}>#{tag}</FilterChip>}
          {space && (
            <FilterChip onRemove={() => setSpace('')}>
              스페이스: {spaceOptions.find((o) => o.id === space)?.title ?? space}
            </FilterChip>
          )}
          {fromDate && <FilterChip onRemove={() => setFromDate('')}>≥ {fromDate}</FilterChip>}
          {toDate && <FilterChip onRemove={() => setToDate('')}>≤ {toDate}</FilterChip>}
          {sort !== 'relevance' && (
            <FilterChip onRemove={() => setSort('relevance')}>
              정렬: {SORT_OPTIONS.find((s) => s.value === sort)?.label}
            </FilterChip>
          )}
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">검색 중...</p>}

      {!loading && hits.length === 0 && summary && (
        <p className="text-sm text-muted-foreground">
          조건 <code className="rounded bg-muted px-1">{summary}</code>에 해당하는 결과가 없습니다.
        </p>
      )}

      {!loading && hits.length > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          <strong>{hits.length}</strong>개 결과 · {summary}
        </p>
      )}

      <ul className="space-y-3">
        {hits.map((h) => (
          <li key={h.id} className="rounded-lg border bg-card p-4">
            <Link href={`/pages/${h.id}`} className="text-base font-semibold hover:underline">
              {highlight(h.title, q)}
            </Link>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge status={h.status} />
              <span>@{h.authorName}</span>
              <span>·</span>
              <span>{new Date(h.updatedAt).toLocaleDateString()}</span>
              <span>·</span>
              <span>{MATCH_LABEL[h.matchType]}</span>
              {typeof h.score === 'number' && h.score > 0 && (
                <>
                  <span>·</span>
                  <span className="font-mono">{h.score.toFixed(2)}</span>
                </>
              )}
            </div>
            {h.snippet && (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {highlight(h.snippet, q)}
              </p>
            )}
            {h.matchedAttachments && h.matchedAttachments.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {h.matchedAttachments.map((a) => (
                  <li
                    key={a.id}
                    className="rounded border bg-secondary/50 px-2 py-0.5 text-xs"
                  >
                    📎 {a.filename}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilterChip({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2 py-0.5 text-secondary-foreground">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-accent"
        aria-label="필터 제거"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function highlight(text: string, term: string): React.ReactNode {
  if (!term.trim()) return text;
  const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(re);
  return parts.map((p, i) =>
    re.test(p) ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-900/50">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
