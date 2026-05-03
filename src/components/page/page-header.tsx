'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Eye, Star, History, MoreHorizontal, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/page/status-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, parseISO } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { TagEditor } from '@/components/page/tag-editor';
import { AttachmentPanel } from '@/components/attachments/attachment-panel';
import { WatchButton } from '@/components/page/watch-button';
import type { PageData, PageStatus } from '@/types';

interface Props {
  page: PageData;
  mode: 'view' | 'edit';
  onStatusChange?: (next: PageStatus) => void;
}

const STATUS_OPTIONS: PageStatus[] = ['Draft', 'Review', 'Approved', 'Pending', 'Archived'];

export function PageHeader({ page, mode, onStatusChange }: Props) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const list: { id: string; title: string }[] = JSON.parse(
      localStorage.getItem('pi-wiki:favorites') || '[]',
    );
    setFavorited(list.some((f) => f.id === page.treeNode.id));
  }, [page.treeNode.id]);

  const toggleFavorite = () => {
    if (typeof window === 'undefined') return;
    const list: { id: string; title: string }[] = JSON.parse(
      localStorage.getItem('pi-wiki:favorites') || '[]',
    );
    const exists = list.some((f) => f.id === page.treeNode.id);
    const next = exists
      ? list.filter((f) => f.id !== page.treeNode.id)
      : [{ id: page.treeNode.id, title: page.treeNode.title }, ...list].slice(0, 20);
    localStorage.setItem('pi-wiki:favorites', JSON.stringify(next));
    setFavorited(!exists);
  };

  const updatedAt = (() => {
    try {
      return format(parseISO(page.updatedAt), 'yyyy-MM-dd HH:mm');
    } catch {
      return '';
    }
  })();

  const onChangeStatus = async (s: PageStatus) => {
    const body: Record<string, unknown> = { status: s };
    if (s === 'Pending') {
      const reason = window.prompt('보류 사유와 결정 필요 사항을 입력하세요 (FR-705)');
      if (!reason) return;
      body.pendingReason = reason;
    }
    const res = await fetch(`/api/pages/${page.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast({ title: '상태 변경 완료' });
      onStatusChange?.(s);
      router.refresh();
    } else {
      const json = await res.json().catch(() => ({}));
      toast({
        title: '상태 변경 실패',
        description: json?.error || '',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="border-b bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-6 py-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <span className="text-lg">{page.treeNode.icon || '📄'}</span>
        <h1 className="truncate text-lg font-semibold" title={page.treeNode.title}>
          {page.treeNode.title}
        </h1>

        <Select value={page.status} onValueChange={(v) => onChangeStatus(v as PageStatus)}>
          <SelectTrigger className="ml-1 h-7 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                <span className="flex items-center gap-2">
                  <StatusBadge status={s} />
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground">
          @{page.authorName} · {updatedAt}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <WatchButton pageId={page.id} treeNodeId={page.treeNode.id} />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAttachOpen(true)}
            title="첨부 파일"
            aria-label="첨부 파일"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" onClick={toggleFavorite} title="즐겨찾기">
            <Star className={favorited ? 'h-4 w-4 fill-yellow-400 text-yellow-500' : 'h-4 w-4'} />
          </Button>

          {mode === 'view' ? (
            <Button asChild size="sm">
              <Link href={`/pages/${page.id}/edit`}>
                <Pencil className="h-4 w-4" />
                편집
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href={`/pages/${page.id}`}>
                <Eye className="h-4 w-4" />
                보기
              </Link>
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/pages/${page.id}/history`}>
                  <History className="h-3.5 w-3.5" /> 버전 이력
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-3">
        <TagEditor
          pageId={page.id}
          editable={mode === 'edit'}
          initialTags={page.tags.map(({ tag }) => ({
            id: tag.id,
            name: tag.name,
            color: tag.color,
          }))}
          onChanged={() => router.refresh()}
        />
      </div>

      <AttachmentPanel pageId={page.id} open={attachOpen} onOpenChange={setAttachOpen} />
    </div>
  );
}
