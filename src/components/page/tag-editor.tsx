/**
 * TagEditor — FR-801 ~ FR-805
 *
 * 페이지 메타에 표시되는 태그 편집기.
 * - 태그 칩 표시 + X 버튼 제거
 * - 입력창 + 자동완성 (전체 태그 목록 prefix 매칭)
 * - Enter / 콤마 입력으로 태그 추가 (없으면 자동 생성)
 *
 * API:
 *   GET    /api/tags                전체 태그 목록
 *   POST   /api/pages/[id]/tags     태그 추가 (auto-upsert)
 *   DELETE /api/pages/[id]/tags?tagId=...
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, X, Tag as TagIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';

export interface TagChipData {
  id: string;
  name: string;
  color?: string | null;
}

interface Props {
  pageId: string;
  initialTags: TagChipData[];
  /** 태그 추가/제거 후 부모 새로고침 (page refetch). */
  onChanged?: () => void;
  /** true 면 편집 가능, false 면 읽기 전용 칩만 표시. */
  editable?: boolean;
  className?: string;
}

interface TagListItem {
  id: string;
  name: string;
  color: string | null;
  usageCount: number;
}

export function TagEditor({
  pageId,
  initialTags,
  onChanged,
  editable = true,
  className,
}: Props) {
  const [tags, setTags] = useState<TagChipData[]>(initialTags);
  const [allTags, setAllTags] = useState<TagListItem[]>([]);
  const [input, setInput] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const [hi, setHi] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // initialTags 변경 시 동기화
  useEffect(() => {
    setTags(initialTags);
  }, [initialTags]);

  // 전체 태그 목록 fetch (자동완성용)
  useEffect(() => {
    if (!editable) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tags', { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && json.ok) setAllTags(json.data);
      } catch {
        /* 무시 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editable]);

  // suggestion 후보
  const suggestions = useMemo(() => {
    if (!input.trim()) return [];
    const q = input.trim().toLowerCase();
    const taken = new Set(tags.map((t) => t.name.toLowerCase()));
    return allTags
      .filter(
        (t) => !taken.has(t.name.toLowerCase()) && t.name.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [allTags, input, tags]);

  // 외부 클릭 시 자동완성 닫기
  useEffect(() => {
    if (!showSuggest) return;
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggest(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showSuggest]);

  const addTag = async (rawName: string) => {
    const name = rawName.trim().replace(/^#/, '');
    if (!name) return;
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setInput('');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/pages/${pageId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || '태그 추가 실패');
      }
      const created: TagChipData = {
        id: json.data.id,
        name: json.data.name,
        color: json.data.color ?? null,
      };
      setTags((s) => [...s, created]);
      // 전체 목록에도 반영
      setAllTags((s) => {
        if (s.some((t) => t.id === created.id)) return s;
        return [
          ...s,
          { id: created.id, name: created.name, color: created.color ?? null, usageCount: 1 },
        ];
      });
      setInput('');
      setShowSuggest(false);
      setHi(0);
      onChanged?.();
    } catch (err) {
      toast({
        title: '태그 추가 실패',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const removeTag = async (tag: TagChipData) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/pages/${pageId}/tags?tagId=${encodeURIComponent(tag.id)}`,
        { method: 'DELETE' },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || '태그 제거 실패');
      }
      setTags((s) => s.filter((t) => t.id !== tag.id));
      onChanged?.();
    } catch (err) {
      toast({
        title: '태그 제거 실패',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (showSuggest && suggestions[hi]) {
        addTag(suggestions[hi].name);
      } else if (input.trim()) {
        addTag(input);
      }
      return;
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      // 빈 상태에서 백스페이스 → 마지막 태그 제거
      e.preventDefault();
      removeTag(tags[tags.length - 1]);
      return;
    }
    if (e.key === 'ArrowDown') {
      if (suggestions.length > 0) {
        e.preventDefault();
        setShowSuggest(true);
        setHi((i) => (i + 1) % suggestions.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      if (suggestions.length > 0) {
        e.preventDefault();
        setShowSuggest(true);
        setHi((i) => (i - 1 + suggestions.length) % suggestions.length);
      }
      return;
    }
    if (e.key === 'Escape') {
      setShowSuggest(false);
      return;
    }
  };

  // 읽기 전용 모드
  if (!editable) {
    if (tags.length === 0) return null;
    return (
      <div className={cn('flex flex-wrap gap-1', className)}>
        {tags.map((tag) => (
          <Link
            key={tag.id}
            href={`/tags?name=${encodeURIComponent(tag.name)}`}
            className="rounded-md border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-accent"
            style={tag.color ? { borderColor: tag.color } : undefined}
          >
            #{tag.name}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn('relative flex flex-wrap items-center gap-1', className)}>
      <TagIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-md border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
          style={tag.color ? { borderColor: tag.color } : undefined}
        >
          <Link
            href={`/tags?name=${encodeURIComponent(tag.name)}`}
            className="hover:underline"
          >
            #{tag.name}
          </Link>
          <button
            type="button"
            aria-label={`${tag.name} 제거`}
            onClick={() => removeTag(tag)}
            disabled={busy}
            className="grid h-3.5 w-3.5 place-items-center rounded text-muted-foreground hover:bg-accent-foreground/10 disabled:opacity-50"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}

      <div className="relative">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggest(true);
            setHi(0);
          }}
          onFocus={() => setShowSuggest(true)}
          onKeyDown={onKeyDown}
          disabled={busy}
          placeholder="태그 추가…"
          className="h-6 min-w-[8rem] px-2 text-xs"
          aria-label="태그 추가"
          aria-autocomplete="list"
          aria-expanded={showSuggest && suggestions.length > 0}
        />
        {showSuggest && suggestions.length > 0 && (
          <ul
            role="listbox"
            className="absolute left-0 top-full z-30 mt-1 max-h-56 w-48 overflow-auto rounded border bg-popover py-1 text-sm shadow-md"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                role="option"
                aria-selected={i === hi}
                onMouseDown={(e) => {
                  // input blur 방지
                  e.preventDefault();
                  addTag(s.name);
                }}
                onMouseEnter={() => setHi(i)}
                className={cn(
                  'cursor-pointer px-2 py-1 text-xs',
                  i === hi ? 'bg-accent' : 'hover:bg-accent',
                )}
              >
                <span className="font-medium">#{s.name}</span>
                <span className="ml-2 text-[10px] text-muted-foreground">
                  {s.usageCount}회
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {input.trim() && suggestions.length === 0 && showSuggest && (
        <button
          type="button"
          onClick={() => addTag(input)}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />새로 만들기 #{input.trim().replace(/^#/, '')}
        </button>
      )}
    </div>
  );
}
