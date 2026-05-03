'use client';

/**
 * 페이지별 첨부 파일 사이드 패널 — FR-1109
 *
 * - 우측 슬라이드 패널 형태 (Dialog 의 측면 변형으로 구현)
 * - 페이지에 첨부된 모든 파일 조회/업로드/삭제
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Paperclip, Loader2, X, Search, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { UploadDropzone, type AttachmentDTO } from './upload-dropzone';
import { AttachmentCard } from './attachment-card';

interface Props {
  pageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AttachmentPanel({ pageId, open, onOpenChange }: Props) {
  const [items, setItems] = useState<AttachmentDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attachments?pageId=${encodeURIComponent(pageId)}`, {
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || '목록 조회 실패');
      setItems((json?.data ?? []) as AttachmentDTO[]);
    } catch (e) {
      toast({
        title: '첨부 목록을 불러오지 못했습니다',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const onUploaded = useCallback((att: AttachmentDTO) => {
    setItems((prev) => [att, ...prev]);
  }, []);

  const onDeleted = useCallback((id: string) => {
    setItems((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((a) => a.filename.toLowerCase().includes(q));
  }, [items, query]);

  const totalSize = items.reduce((acc, a) => acc + a.size, 0);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/40 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l bg-background shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full',
            'duration-200',
          )}
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">첨부 파일</DialogPrimitive.Title>

          {/* 헤더 */}
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">첨부 파일</h2>
            <span className="text-xs text-muted-foreground">
              · {items.length}개 · {formatBytesShort(totalSize)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-8 w-8"
              onClick={() => void load()}
              aria-label="새로고침"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="닫기">
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          {/* 업로드 영역 */}
          <div className="border-b p-3">
            <UploadDropzone
              pageId={pageId}
              mode="all"
              onUploaded={onUploaded}
              compact
            />
          </div>

          {/* 검색 */}
          <div className="border-b px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="파일명 검색"
                className="h-8 pl-7 text-sm"
              />
            </div>
          </div>

          {/* 목록 */}
          <ScrollArea className="flex-1">
            <div className="space-y-2 p-3">
              {loading && items.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  불러오는 중…
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {items.length === 0
                    ? '아직 첨부된 파일이 없습니다.'
                    : '검색 결과가 없습니다.'}
                </div>
              ) : (
                filtered.map((a) => (
                  <AttachmentCard
                    key={a.id}
                    attachment={a}
                    onDeleted={onDeleted}
                    compact
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function formatBytesShort(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
