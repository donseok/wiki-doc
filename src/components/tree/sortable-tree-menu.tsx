/**
 * SortableTreeMenu — FR-103 트리 DnD
 *
 * @dnd-kit 기반의 정렬 가능한 트리 메뉴.
 * - 같은 부모 내 순서 변경
 * - 다른 부모로 이동 (폴더 위에 드롭하면 자식으로 이동)
 * - 드롭 인디케이터(가로선) 시각화
 * - 키보드 접근성 (KeyboardSensor)
 *
 * 결과는 POST /api/tree/reorder 로 일괄 반영.
 *
 * 기존 tree-menu.tsx 의 우클릭/이름변경/삭제/새 항목 기능은 그대로 유지.
 * (TreeNodeRow 컴포넌트로 추출)
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  Palette,
  Plus,
  MoreVertical,
  Trash2,
  PencilLine,
  GripVertical,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TemplatePickerDialog } from '@/components/page/template-picker-dialog';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import type { TreeNodeData } from '@/types';

interface Props {
  nodes: TreeNodeData[];
  filter?: string;
  onChanged: () => void;
}

interface NodeWithChildren extends TreeNodeData {
  children: NodeWithChildren[];
}

/** flat 리스트로 펼친 항목 (열림 상태인 폴더의 자식만 포함) */
interface FlatItem {
  node: NodeWithChildren;
  depth: number;
  /** 자식 보유 여부 */
  hasChildren: boolean;
}

/** 드롭 위치 — 정렬용 또는 폴더 자식으로 들어가기 */
type DropPosition =
  | { kind: 'before' | 'after'; targetId: string }
  | { kind: 'inside'; targetId: string };

/* ------------------------------------------------------------------ */
/* 트리 변환 유틸                                                     */
/* ------------------------------------------------------------------ */

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

function matchesFilter(node: NodeWithChildren, q: string): boolean {
  if (!q) return true;
  const lc = q.toLowerCase();
  if (node.title.toLowerCase().includes(lc)) return true;
  return node.children.some((c) => matchesFilter(c, q));
}

/** open 상태를 고려해 가시 트리를 flat 리스트로 만든다. */
function flatten(
  nodes: NodeWithChildren[],
  openMap: Record<string, boolean>,
  filter: string,
  depth = 0,
  out: FlatItem[] = [],
): FlatItem[] {
  for (const n of nodes) {
    if (filter && !matchesFilter(n, filter)) continue;
    const hasChildren = n.children.length > 0;
    out.push({ node: n, depth, hasChildren });
    const isFolder = n.type === 'folder';
    const open = filter ? true : openMap[n.id] ?? depth < 1;
    if (isFolder && open && hasChildren) {
      flatten(n.children, openMap, filter, depth + 1, out);
    }
  }
  return out;
}

/** 노드 id 의 모든 자손 id 집합 (자기 자신 포함) — DnD 안전 검사용 */
function collectDescendantIds(node: NodeWithChildren, out = new Set<string>()): Set<string> {
  out.add(node.id);
  for (const c of node.children) collectDescendantIds(c, out);
  return out;
}

/* ------------------------------------------------------------------ */
/* 메인                                                               */
/* ------------------------------------------------------------------ */

const OPEN_KEY = 'pi-wiki:tree-open-map';

export function SortableTreeMenu({ nodes, filter = '', onChanged }: Props) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);

  // 폴더 open/close 상태
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(OPEN_KEY, JSON.stringify(openMap));
    }
  }, [openMap]);

  const setOpen = (id: string, next: boolean) =>
    setOpenMap((s) => ({ ...s, [id]: next }));

  const flat = useMemo(() => flatten(tree, openMap, filter), [tree, openMap, filter]);

  // DnD 상태
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropPos, setDropPos] = useState<DropPosition | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const idToNode = useMemo(() => {
    const m = new Map<string, NodeWithChildren>();
    const walk = (arr: NodeWithChildren[]) => {
      for (const n of arr) {
        m.set(n.id, n);
        walk(n.children);
      }
    };
    walk(tree);
    return m;
  }, [tree]);

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setDropPos(null);
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) {
      setDropPos(null);
      return;
    }
    const targetId = String(over.id);
    const target = idToNode.get(targetId);
    const dragging = idToNode.get(String(active.id));
    if (!target || !dragging) {
      setDropPos(null);
      return;
    }

    // 자기 자신 또는 자손 위로는 드롭 금지
    const banned = collectDescendantIds(dragging);
    if (banned.has(targetId)) {
      setDropPos(null);
      return;
    }

    // 폴더 위 → inside (자식으로)
    // 그 외 → before/after (마우스 Y 위치 기준)
    if (target.type === 'folder') {
      // dnd-kit 의 over.rect 와 active 의 translated rect 로 위치 결정
      const overRect = e.over?.rect;
      const activeRect = e.active.rect.current.translated;
      if (overRect && activeRect) {
        const middle = overRect.top + overRect.height / 2;
        const cy = activeRect.top + activeRect.height / 2;
        // 폴더의 가운데 ~ 1/4 영역이면 inside, 위쪽이면 before, 아래쪽이면 after
        const upper = overRect.top + overRect.height * 0.25;
        const lower = overRect.top + overRect.height * 0.75;
        if (cy < upper) setDropPos({ kind: 'before', targetId });
        else if (cy > lower) setDropPos({ kind: 'after', targetId });
        else setDropPos({ kind: 'inside', targetId });
        // middle 미사용 변수 경고 회피
        void middle;
      } else {
        setDropPos({ kind: 'inside', targetId });
      }
    } else {
      const overRect = e.over?.rect;
      const activeRect = e.active.rect.current.translated;
      if (overRect && activeRect) {
        const middle = overRect.top + overRect.height / 2;
        const cy = activeRect.top + activeRect.height / 2;
        setDropPos({ kind: cy < middle ? 'before' : 'after', targetId });
      } else {
        setDropPos({ kind: 'after', targetId });
      }
    }
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const draggingId = String(e.active.id);
    const pos = dropPos;
    setActiveId(null);
    setDropPos(null);
    if (!pos) return;
    const dragging = idToNode.get(draggingId);
    const target = idToNode.get(pos.targetId);
    if (!dragging || !target) return;
    if (dragging.id === target.id) return;

    // 자기 자신/자손 안으로 이동 금지
    const banned = collectDescendantIds(dragging);
    if (banned.has(target.id)) {
      toast({ title: '자기 자신/자손에는 이동할 수 없습니다', variant: 'destructive' });
      return;
    }

    // 새 부모 결정
    let newParentId: string | null;
    let siblingsAfter: string[];

    if (pos.kind === 'inside') {
      // target(폴더) 의 마지막 자식으로
      newParentId = target.id;
      const childIds = target.children.map((c) => c.id).filter((id) => id !== dragging.id);
      siblingsAfter = [...childIds, dragging.id];
      // 폴더를 자동으로 펼침
      setOpen(target.id, true);
    } else {
      // before/after: target 과 같은 부모에 형제 삽입
      newParentId = target.parentId ?? null;
      const siblings = newParentId
        ? idToNode.get(newParentId)?.children ?? []
        : tree;
      const ids = siblings.map((s) => s.id).filter((id) => id !== dragging.id);
      const targetIdx = ids.indexOf(target.id);
      const insertAt = pos.kind === 'before' ? targetIdx : targetIdx + 1;
      siblingsAfter = [...ids.slice(0, insertAt), dragging.id, ...ids.slice(insertAt)];
    }

    try {
      const res = await fetch('/api/tree/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: newParentId, orderedIds: siblingsAfter }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || '순서 변경 실패');
      }
      toast({ title: '트리 업데이트 완료' });
      onChanged();
    } catch (err) {
      toast({
        title: '트리 업데이트 실패',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      });
    }
  };

  const onDragCancel = () => {
    setActiveId(null);
    setDropPos(null);
  };

  const visibleIds = flat.map((f) => f.node.id);
  const activeNode = activeId ? idToNode.get(activeId) ?? null : null;

  return (
    <div className="space-y-0.5 px-1">
      {flat.length === 0 && (
        <div className="px-2 py-3 text-xs text-muted-foreground">
          노드가 없습니다. 우클릭으로 새 항목을 추가하세요.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <ul role="tree" className="space-y-0.5">
          {flat.map((item) => (
            <SortableNodeRow
              key={item.node.id}
              item={item}
              dropPos={dropPos}
              draggingId={activeId}
              isOpen={
                filter
                  ? true
                  : openMap[item.node.id] ?? item.depth < 1
              }
              setOpen={setOpen}
              onChanged={onChanged}
              allIds={visibleIds}
            />
          ))}
        </ul>

        <DragOverlay>
          {activeNode && (
            <div className="rounded border bg-card px-2 py-1 text-sm shadow">
              {activeNode.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <RootAddButton onChanged={onChanged} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 행 (Sortable wrapper + 노드 콘텐츠)                                */
/* ------------------------------------------------------------------ */

function SortableNodeRow({
  item,
  dropPos,
  draggingId,
  isOpen,
  setOpen,
  onChanged,
}: {
  item: FlatItem;
  dropPos: DropPosition | null;
  draggingId: string | null;
  isOpen: boolean;
  setOpen: (id: string, next: boolean) => void;
  onChanged: () => void;
  allIds: string[];
}) {
  const { node, depth, hasChildren } = item;
  const sortable = useSortable({ id: node.id });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const showBefore = dropPos?.kind === 'before' && dropPos.targetId === node.id;
  const showAfter = dropPos?.kind === 'after' && dropPos.targetId === node.id;
  const showInside = dropPos?.kind === 'inside' && dropPos.targetId === node.id;

  return (
    <li ref={setNodeRef} style={style} role="treeitem" aria-level={depth + 1}>
      {/* 드롭 인디케이터 (위) */}
      {showBefore && (
        <div
          className="h-0.5 rounded bg-primary"
          style={{ marginLeft: 4 + depth * 12 }}
          aria-hidden
        />
      )}

      <TreeNodeRow
        node={node}
        depth={depth}
        hasChildren={hasChildren}
        isOpen={isOpen}
        onToggleOpen={() => setOpen(node.id, !isOpen)}
        dragHandleProps={{ ...attributes, ...listeners }}
        insideHighlight={showInside}
        isOtherDragging={draggingId !== null && draggingId !== node.id}
        onChanged={onChanged}
      />

      {showAfter && (
        <div
          className="h-0.5 rounded bg-primary"
          style={{ marginLeft: 4 + depth * 12 }}
          aria-hidden
        />
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* 노드 렌더 (기존 tree-menu.tsx 의 기능 보존)                        */
/* ------------------------------------------------------------------ */

function TreeNodeRow({
  node,
  depth,
  hasChildren,
  isOpen,
  onToggleOpen,
  dragHandleProps,
  insideHighlight,
  isOtherDragging,
  onChanged,
}: {
  node: NodeWithChildren;
  depth: number;
  hasChildren: boolean;
  isOpen: boolean;
  onToggleOpen: () => void;
  dragHandleProps: Record<string, unknown>;
  insideHighlight: boolean;
  isOtherDragging: boolean;
  onChanged: () => void;
}) {
  const params = useParams();
  const activeId = (params?.id as string) || '';
  const router = useRouter();

  const isFolder = node.type === 'folder';
  const isActive = activeId === node.id;

  const Icon = isFolder
    ? isOpen
      ? FolderOpen
      : Folder
    : node.type === 'whiteboard'
      ? Palette
      : FileText;
  const href = isFolder
    ? '#'
    : node.type === 'whiteboard'
      ? `/whiteboards/${node.id}`
      : `/pages/${node.id}`;

  const onRename = async () => {
    const next = window.prompt('새 이름', node.title)?.trim();
    if (!next || next === node.title) return;
    const res = await fetch(`/api/tree/${node.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: next }),
    });
    if (res.ok) {
      toast({ title: '이름 변경 완료' });
      onChanged();
    } else {
      toast({ title: '이름 변경 실패', variant: 'destructive' });
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`"${node.title}" 을 삭제할까요? 하위 항목도 모두 삭제됩니다.`)) return;
    const res = await fetch(`/api/tree/${node.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ title: '삭제 완료' });
      onChanged();
      if (isActive) router.push('/dashboard');
    } else {
      toast({ title: '삭제 실패', variant: 'destructive' });
    }
  };

  const onAddFolder = async () => {
    const title = window.prompt('새 폴더 이름', '새 폴더')?.trim();
    if (!title) return;
    const res = await fetch('/api/tree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId: node.id, type: 'folder', title }),
    });
    if (res.ok) {
      onChanged();
    }
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded px-1 py-0.5 text-sm hover:bg-accent',
        isActive && 'bg-accent text-accent-foreground',
        insideHighlight && 'ring-2 ring-primary',
      )}
      style={{ paddingLeft: 4 + depth * 12 }}
    >
      {/* 드래그 핸들 — 키보드 접근성: tabindex 부여, Space/Enter 로 grab */}
      <button
        type="button"
        aria-label={`${node.title} 끌어서 옮기기`}
        className={cn(
          'grid h-5 w-4 cursor-grab place-items-center rounded text-muted-foreground/50',
          'hover:bg-accent-foreground/10 active:cursor-grabbing',
          isOtherDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        {...dragHandleProps}
      >
        <GripVertical className="h-3 w-3" />
      </button>

      {isFolder ? (
        <button
          type="button"
          aria-label={isOpen ? '접기' : '펼치기'}
          onClick={onToggleOpen}
          className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-accent-foreground/10"
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      ) : (
        <span className="grid h-5 w-5 place-items-center" />
      )}

      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />

      {isFolder ? (
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex-1 truncate text-left"
          title={node.title}
        >
          {node.title}
        </button>
      ) : (
        <Link href={href} className="flex-1 truncate" title={node.title}>
          {node.title}
        </Link>
      )}

      {!isFolder && node.page?.status && node.page.status !== 'Draft' && (
        <span className="hidden text-[10px] uppercase text-muted-foreground group-hover:inline">
          {node.page.status.charAt(0)}
        </span>
      )}

      {/* 자식 개수 표시 (펼침 상태가 아닐 때) */}
      {isFolder && !isOpen && hasChildren && (
        <span className="text-[10px] text-muted-foreground">{node.children.length}</span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          className="grid h-5 w-5 place-items-center rounded opacity-0 hover:bg-accent-foreground/10 group-hover:opacity-100"
          aria-label="더 보기"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isFolder && (
            <>
              <NewPageMenuItem parentId={node.id} onCreated={onChanged} />
              <DropdownMenuItem onClick={onAddFolder}>
                <Plus className="h-3.5 w-3.5" /> 새 폴더
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={onRename}>
            <PencilLine className="h-3.5 w-3.5" /> 이름 변경
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> 삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function NewPageMenuItem({
  parentId,
  onCreated,
}: {
  parentId: string | null;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> 새 페이지
      </DropdownMenuItem>
      <TemplatePickerDialog
        open={open}
        onOpenChange={setOpen}
        parentId={parentId}
        onCreated={onCreated}
      />
    </>
  );
}

function RootAddButton({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const onAddRootFolder = async () => {
    const title = window.prompt('새 최상위 폴더 이름', '새 폴더')?.trim();
    if (!title) return;
    const res = await fetch('/api/tree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId: null, type: 'folder', title }),
    });
    if (res.ok) onChanged();
  };

  return (
    <div className="mt-2 flex gap-1 px-1 pb-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-1 items-center justify-center gap-1 rounded border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-accent"
      >
        <Plus className="h-3.5 w-3.5" /> 새 페이지
      </button>
      <button
        type="button"
        onClick={onAddRootFolder}
        className="flex flex-1 items-center justify-center gap-1 rounded border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-accent"
      >
        <Plus className="h-3.5 w-3.5" /> 새 폴더
      </button>
      <TemplatePickerDialog
        open={open}
        onOpenChange={setOpen}
        parentId={null}
        onCreated={onChanged}
      />
    </div>
  );
}
