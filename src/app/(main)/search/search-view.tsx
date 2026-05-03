'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/page/status-badge';
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

const MATCH_LABEL: Record<SearchHit['matchType'], string> = {
  title: '제목 일치',
  body: '본문 일치',
  tag: '태그 일치',
  attachment: '첨부 파일명 일치',
};

export function SearchView() {
  const sp = useSearchParams();
  const initialQ = sp.get('q') || '';
  const initialStatus = (sp.get('status') as PageStatus) || '';

  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState<string>(initialStatus);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async (term: string, statusFilter: string) => {
    if (!term.trim() && !statusFilter) {
      setHits([]);
      return;
    }
    setLoading(true);
    try {
      const url = new URL('/api/search', window.location.origin);
      if (term.trim()) url.searchParams.set('q', term.trim());
      if (statusFilter) url.searchParams.set('status', statusFilter);
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) setHits(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialQ || initialStatus) run(initialQ, initialStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ, initialStatus]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-2xl font-bold">검색</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(q, status);
        }}
        className="mb-6 flex flex-wrap items-center gap-2"
      >
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색어"
          className="max-w-md flex-1"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">모든 상태</option>
          <option value="Draft">초안</option>
          <option value="Review">검토</option>
          <option value="Approved">승인</option>
          <option value="Pending">보류</option>
          <option value="Archived">보관</option>
        </select>
        <Button type="submit">검색</Button>
      </form>

      {loading && <p className="text-sm text-muted-foreground">검색 중...</p>}

      {!loading && hits.length === 0 && (q || status) && (
        <p className="text-sm text-muted-foreground">결과가 없습니다.</p>
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
