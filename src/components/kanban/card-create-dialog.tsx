'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CARD_COLORS, COLUMN_LABEL, type KanbanColumn } from '@/lib/kanban';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';

interface Props {
  boardId: string;
  column: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

export function CardCreateDialog({ boardId, column, open, onOpenChange, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [color, setColor] = useState('default');
  const [submitting, setSubmitting] = useState(false);

  const close = (v: boolean) => {
    if (!v) {
      setTitle('');
      setBody('');
      setColor('default');
    }
    onOpenChange(v);
  };

  const submit = async () => {
    if (!title.trim()) {
      toast({ title: '제목을 입력하세요', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column, title: title.trim(), body: body.trim() || null, color }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || '생성 실패');
      onCreated();
      close(false);
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

  const colLabel = COLUMN_LABEL[column as KanbanColumn] ?? column;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 카드 — {colLabel}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="card-title">제목</Label>
            <Input
              id="card-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="아이디어 / 이슈 제목"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-body">내용 (선택)</Label>
            <Textarea
              id="card-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="간략 설명, 토론 포인트, 관련 링크 등"
            />
          </div>
          <div className="space-y-1.5">
            <Label>색상</Label>
            <div className="flex flex-wrap gap-1.5">
              {CARD_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setColor(c.key)}
                  className={cn(
                    'h-7 w-7 rounded border-2 transition-all',
                    c.bg,
                    c.border,
                    color === c.key && 'ring-2 ring-ring ring-offset-1',
                  )}
                  title={c.label}
                  aria-label={c.label}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={submitting}>
            취소
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? '생성 중...' : '카드 추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
