'use client';

/**
 * 워크스페이스 (트리 폴더) 선택 Popover — FR-808
 *
 * - GET /api/tree 응답을 부모-자식 관계로 재구성하여 트리로 표시
 * - type === 'folder' 노드만 선택 가능. page/whiteboard 는 disabled+회색 표시
 * - 빈 문자열("") = 루트 (트리 최상위)
 * - 검색 / 키보드(↑↓ Enter Esc) / 다크모드 / a11y(role=tree, treeitem) 대응
 *
 * Round 4 designer spec §4.3.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Pencil,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { TreeNodeData } from '@/types';

interface NodeWithChildren extends TreeNodeData {
  children: NodeWithChildren[];
}

interface Props {
  value: string;
  onChange: (nodeId: string) => void;
  disabled?: boolean;
}

function buildTree(flat: TreeNodeData[]): NodeWithChildren[] {
  const map = new Map<string, NodeWithChildren>();
  flat.forEach((n) => map.set(n.id, { ...n, children: [] }));
  const roots: NodeWithChildren[] = [];
  for (const node of map.values()) {
    if (node.parentId) {
      const parent = map.get(node.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRecursive = (arr: NodeWithChildren[]) => {
    arr.sort((a, b) => a.order - b.order);
    arr.forEach((c) => sortRecursive(c.children));
  };
  sortRecursive(roots);
  return roots;
}

function findNode(nodes: TreeNodeData[], id: string): TreeNodeData | null {
  return nodes.find((n) => n.id === id) ?? null;
}

function buildPath(nodes: TreeNodeData[], id: string): string {
  if (!id) return '루트';
  const map = new Map(nodes.map((n) => [n.id, n] as const));
  const segs: string[] = [];
  let cursor: TreeNodeData | undefined = map.get(id);
  let guard = 0;
  while (cursor && guard < 32) {
    segs.unshift(cursor.title);
    cursor = cursor.parentId ? map.get(cursor.parentId) : undefined;
    guard += 1;
  }
  return segs.join(' / ');
}

interface FlatRow {
  node: NodeWithChildren;
  depth: number;
  hasFolderChildren: boolean;
  isExpanded: boolean;
}

function flattenForRender(
  tree: NodeWithChildren[],
  openMap: Record<string, boolean>,
  query: string,
  depth = 0,
  out: FlatRow[] = [],
): FlatRow[] {
  const lc = query.trim().toLowerCase();
  for (const n of tree) {
    const hasFolderChildren = n.children.some((c) => c.type === 'folder');
    // 검색 모드: 매칭되는 노드 또는 매칭되는 자손이 있는 폴더만 표시
    const selfMatch = lc.length === 0 || n.title.toLowerCase().includes(lc);
    const subtreeMatch = lc.length > 0 && hasAnyMatch(n, lc);
    if (lc.length > 0 && !selfMatch && !subtreeMatch) continue;
    // 검색 시 자동 펼침. 그 외 openMap (기본: depth < 1 만 펼침)
    const isExpanded = lc.length > 0 ? true : openMap[n.id] ?? depth < 1;
    out.push({ node: n, depth, hasFolderChildren, isExpanded });
    if (isExpanded && n.children.length > 0) {
      flattenForRender(n.children, openMap, query, depth + 1, out);
    }
  }
  return out;
}

function hasAnyMatch(node: NodeWithChildren, lc: string): boolean {
  if (node.title.toLowerCase().includes(lc)) return true;
  return node.children.some((c) => hasAnyMatch(c, lc));
}

export function WorkspacePicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState<TreeNodeData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [activeIndex, setActiveIndex] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tree', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? '트리 로드 실패');
      setNodes(json.data as TreeNodeData[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '로드 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  // Popover 가 처음 열릴 때만 로드. 사용자가 외부에서 트리를 변경했을 수 있으므로
  // open 토글 시마다 한 번씩은 재시도 가능하게 — 단, 닫혀 있을 때는 fetch 안 함.
  useEffect(() => {
    if (open && nodes === null && !loading) {
      void load();
    }
  }, [open, nodes, loading, load]);

  const tree = useMemo(() => (nodes ? buildTree(nodes) : []), [nodes]);
  const rows = useMemo(() => flattenForRender(tree, openMap, query), [tree, openMap, query]);

  // 선택 가능한 행만의 인덱스 매핑 (키보드 ↑↓ 탐색 시 disabled 항목은 건너뜀)
  const selectableIndices = useMemo(
    () =>
      rows
        .map((r, i) => (r.node.type === 'folder' ? i : -1))
        .filter((i): i is number => i >= 0),
    [rows],
  );

  // 활성 인덱스 보정
  useEffect(() => {
    if (selectableIndices.length === 0) {
      setActiveIndex(0);
      return;
    }
    if (!selectableIndices.includes(activeIndex)) {
      setActiveIndex(selectableIndices[0]);
    }
  }, [selectableIndices, activeIndex]);

  const selectedTitle = useMemo(() => {
    if (!value) return '루트';
    const n = nodes ? findNode(nodes, value) : null;
    return n ? n.title : value;
  }, [value, nodes]);

  const selectedPath = useMemo(() => (nodes ? buildPath(nodes, value) : value ? value : '루트'), [
    value,
    nodes,
  ]);

  const toggleOpen = (id: string) => setOpenMap((m) => ({ ...m, [id]: !(m[id] ?? false) }));

  const handleSelect = (node: TreeNodeData) => {
    if (node.type !== 'folder') return;
    onChange(node.id);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = selectableIndices.find((i) => i > activeIndex);
      if (next !== undefined) setActiveIndex(next);
      else if (selectableIndices.length > 0) setActiveIndex(selectableIndices[0]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const before = [...selectableIndices].reverse().find((i) => i < activeIndex);
      if (before !== undefined) setActiveIndex(before);
      else if (selectableIndices.length > 0)
        setActiveIndex(selectableIndices[selectableIndices.length - 1]);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = rows[activeIndex];
      if (r && r.node.type === 'folder') handleSelect(r.node);
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn('h-9 w-full justify-between font-normal', !value && 'text-muted-foreground')}
          aria-haspopup="tree"
          aria-expanded={open}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Folder className="h-4 w-4 flex-shrink-0 text-amber-500" aria-hidden />
            <span className="truncate" title={selectedPath}>
              {selectedTitle}
            </span>
            {!value && (
              <Badge variant="secondary" className="text-[10px]">
                기본
              </Badge>
            )}
          </span>
          <Pencil className="h-3.5 w-3.5 flex-shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[22rem] max-w-[90vw] p-0"
        align="start"
        onKeyDown={onKeyDown}
      >
        <div className="space-y-2 p-3">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="폴더 이름 검색..."
              className="h-8 text-sm"
              aria-label="폴더 검색"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              title="새로고침"
              aria-label="트리 새로고침"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
        <div className="border-t" />

        <ScrollArea className="h-72">
          <div role="tree" aria-label="워크스페이스 트리" className="p-1">
            {/* 루트 항목 */}
            <button
              type="button"
              role="treeitem"
              aria-level={1}
              aria-selected={value === ''}
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50',
                value === '' && 'bg-accent text-accent-foreground',
              )}
            >
              <FolderOpen className="h-4 w-4 flex-shrink-0 text-amber-500" aria-hidden />
              <span className="flex-1 truncate">루트</span>
              <Badge variant="outline" className="text-[10px]">
                기본
              </Badge>
              {value === '' && <Check className="h-4 w-4 text-primary" aria-hidden />}
            </button>

            {loading && (
              <p className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                트리 로드 중...
              </p>
            )}

            {error && !loading && (
              <div className="space-y-2 px-2 py-4 text-center">
                <p className="flex items-center justify-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                  {error}
                </p>
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  다시 시도
                </Button>
              </div>
            )}

            {!loading && !error && nodes !== null && rows.length === 0 && query.trim() && (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                검색 결과가 없습니다.
              </p>
            )}

            {!loading && !error && nodes !== null && nodes.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                폴더가 없습니다 — 사이드바 트리에서 먼저 폴더를 만드세요.
              </p>
            )}

            {!loading && !error && rows.map((row, i) => {
              const { node, depth, hasFolderChildren, isExpanded } = row;
              const isFolder = node.type === 'folder';
              const isSelected = isFolder && value === node.id;
              const isActive = i === activeIndex;
              return (
                <div
                  key={node.id}
                  role="treeitem"
                  aria-level={depth + 2}
                  aria-selected={isSelected}
                  aria-expanded={isFolder && hasFolderChildren ? isExpanded : undefined}
                  aria-disabled={!isFolder}
                  className={cn(
                    'flex items-center gap-1 rounded-sm px-1 py-1 text-sm transition-colors',
                    isFolder
                      ? 'cursor-pointer hover:bg-muted/50'
                      : 'cursor-not-allowed opacity-50',
                    isSelected && 'bg-accent text-accent-foreground',
                    isActive && isFolder && !isSelected && 'bg-muted/40',
                  )}
                  style={{ paddingLeft: `${depth * 16 + 4}px` }}
                  onClick={() => isFolder && handleSelect(node)}
                  onMouseEnter={() => isFolder && setActiveIndex(i)}
                >
                  {isFolder && hasFolderChildren ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleOpen(node.id);
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                      aria-label={isExpanded ? '접기' : '펼치기'}
                      tabIndex={-1}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                  ) : (
                    <span className="inline-block h-5 w-5" aria-hidden />
                  )}
                  {isFolder ? (
                    isExpanded ? (
                      <FolderOpen className="h-4 w-4 flex-shrink-0 text-amber-500" aria-hidden />
                    ) : (
                      <Folder className="h-4 w-4 flex-shrink-0 text-amber-500" aria-hidden />
                    )
                  ) : (
                    <FileText
                      className="h-4 w-4 flex-shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  <span className="flex-1 truncate" title={node.title}>
                    {node.title}
                  </span>
                  {!isFolder && (
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {node.type}
                    </Badge>
                  )}
                  {isSelected && (
                    <Check className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          선택: <span className="font-medium text-foreground">{selectedPath}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
