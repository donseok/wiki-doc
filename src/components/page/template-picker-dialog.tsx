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
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import type { TemplateData } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parentId: string | null;
  onCreated: () => void;
}

export function TemplatePickerDialog({ open, onOpenChange, parentId, onCreated }: Props) {
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    fetch('/api/templates')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setTemplates(j.data);
          if (!selected && j.data.length > 0) {
            const blank = j.data.find((t: TemplateData) => t.id === 'tmpl-blank');
            setSelected((blank ?? j.data[0]).id);
          }
        }
      });
  }, [open, selected]);

  const submit = async () => {
    const t = title.trim();
    if (!t) {
      toast({ title: '제목을 입력하세요', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId,
          type: 'page',
          title: t,
          templateId: selected ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '생성 실패');

      onOpenChange(false);
      setTitle('');
      onCreated();

      // 생성된 노드의 page id로 이동 (페이지 ID = treeNodeId 기반 조회 가능하지만 정확히는 page.id 필요)
      // 1차 단순화: 트리 새로고침 후 사용자가 클릭하도록 둠 (대시보드로 이동)
      router.push('/dashboard');
      toast({ title: '페이지 생성 완료', description: t });
    } catch (e) {
      toast({
        title: '생성 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>새 페이지 만들기</DialogTitle>
          <DialogDescription>
            템플릿을 선택해서 시작하면 형식 일관성이 유지됩니다 (FR-211).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="page-title">페이지 제목</Label>
            <Input
              id="page-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 2026-05-03 주간 회의록"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>템플릿</Label>
            <ScrollArea className="h-[280px] rounded border">
              <div className="grid grid-cols-2 gap-2 p-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelected(t.id)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded border p-3 text-left text-sm transition-colors hover:bg-accent',
                      selected === t.id && 'border-primary bg-accent',
                    )}
                  >
                    <div className="flex w-full items-center gap-2">
                      <span className="text-lg">{t.icon || '📄'}</span>
                      <span className="font-medium">{t.name}</span>
                      {!t.isSystem && (
                        <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                          USER
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {t.description}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? '생성 중...' : '페이지 만들기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
