'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { toastError } from '@/lib/toast-error';
import type { TreeNodeData } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  whiteboardId: string;
  title: string;
}

export function ConvertToPageDialog({ open, onOpenChange, whiteboardId, title }: Props) {
  const router = useRouter();
  const [folders, setFolders] = useState<TreeNodeData[]>([]);
  const [parentId, setParentId] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState(title);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPageTitle(title);
    fetch('/api/tree')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setFolders(j.data.filter((n: TreeNodeData) => n.type === 'folder'));
        }
      })
      .catch(() => undefined);
  }, [open, title]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/whiteboards/${whiteboardId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId, title: pageTitle.trim() || title }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || '변환 실패');
      toast({ title: '페이지로 변환 완료', description: pageTitle });
      onOpenChange(false);
      router.push(`/pages/${json.data.pageId}`);
    } catch (e) {
      toastError('변환 실패', e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>화이트보드 → 페이지 변환 (FR-1209)</DialogTitle>
          <DialogDescription>
            그룹 박스(Frame)는 H2 섹션, 포스트잇은 불릿 리스트로 자동 변환됩니다. 원본 화이트보드는
            그대로 유지됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="page-title">페이지 제목</Label>
            <Input
              id="page-title"
              value={pageTitle}
              onChange={(e) => setPageTitle(e.target.value)}
              placeholder={title}
            />
          </div>
          <div className="space-y-1.5">
            <Label>대상 폴더</Label>
            <select
              value={parentId ?? ''}
              onChange={(e) => setParentId(e.target.value || null)}
              className="h-9 w-full rounded border bg-background px-2 text-sm"
            >
              <option value="">(최상위)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? '변환 중...' : '페이지로 변환'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
