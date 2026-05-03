'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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

export function TreeMenu({ nodes, filter = '', onChanged }: Props) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const visible = filter ? tree.filter((t) => matchesFilter(t, filter)) : tree;

  return (
    <div className="space-y-0.5 px-1">
      {visible.length === 0 && (
        <div className="px-2 py-3 text-xs text-muted-foreground">
          노드가 없습니다. 우클릭으로 새 항목을 추가하세요.
        </div>
      )}
      {visible.map((n) => (
        <TreeNode key={n.id} node={n} depth={0} filter={filter} onChanged={onChanged} />
      ))}
      <RootAddButton onChanged={onChanged} />
    </div>
  );
}

function TreeNode({
  node,
  depth,
  filter,
  onChanged,
}: {
  node: NodeWithChildren;
  depth: number;
  filter: string;
  onChanged: () => void;
}) {
  const params = useParams();
  const activeId = (params?.id as string) || '';
  const router = useRouter();

  const [open, setOpen] = useState(() => {
    if (filter) return true;
    if (typeof window === 'undefined') return depth < 1;
    const v = localStorage.getItem(`pi-wiki:tree-open:${node.id}`);
    return v ? v === '1' : depth < 1;
  });

  const toggle = () => {
    setOpen((s) => {
      const next = !s;
      if (typeof window !== 'undefined') {
        localStorage.setItem(`pi-wiki:tree-open:${node.id}`, next ? '1' : '0');
      }
      return next;
    });
  };

  const isFolder = node.type === 'folder';
  const isActive = activeId === node.id;
  const hasChildren = node.children.length > 0;
  const childMatches = filter ? node.children.some((c) => matchesFilter(c, filter)) : true;
  const showSelf = filter ? matchesFilter(node, filter) : true;
  if (!showSelf) return null;

  const Icon = isFolder ? (open ? FolderOpen : Folder) : node.type === 'whiteboard' ? Palette : FileText;
  const href = isFolder ? '#' : node.type === 'whiteboard' ? `/whiteboards/${node.id}` : `/pages/${node.id}`;

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
      setOpen(true);
      onChanged();
    }
  };

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 rounded px-1 py-0.5 text-sm hover:bg-accent',
          isActive && 'bg-accent text-accent-foreground',
        )}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {isFolder ? (
          <button
            type="button"
            aria-label={open ? '접기' : '펼치기'}
            onClick={toggle}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-accent-foreground/10"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="grid h-5 w-5 place-items-center" />
        )}

        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />

        {isFolder ? (
          <button
            type="button"
            onClick={toggle}
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

      {isFolder && open && hasChildren && (
        <div>
          {node.children.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              filter={filter}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NewPageMenuItem({ parentId, onCreated }: { parentId: string | null; onCreated: () => void }) {
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
