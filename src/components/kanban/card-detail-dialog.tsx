'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ExternalLink, Trash2, Sparkles } from 'lucide-react';
import { CARD_COLORS, type KanbanCardData } from '@/lib/kanban';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import type { TreeNodeData, TemplateData } from '@/types';

interface Props {
  card: KanbanCardData | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}

interface Comment {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
}

export function CardDetailDialog({ card, open, onOpenChange, onChanged }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [color, setColor] = useState('default');
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [showPromote, setShowPromote] = useState(false);
  const [tree, setTree] = useState<TreeNodeData[]>([]);
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [parentId, setParentId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (!card) return;
    setTitle(card.title);
    setBody(card.body ?? '');
    setColor(card.color ?? 'default');
    fetch(`/api/cards/${card.id}/comments`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.data)) setComments(j.data);
      })
      .catch(() => undefined);
    // card.id 만 변경 트리거 — 다른 card 필드는 prop 직접 사용
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  // 페이지 승격 다이얼로그용 데이터
  useEffect(() => {
    if (!showPromote) return;
    Promise.all([
      fetch('/api/tree').then((r) => r.json()),
      fetch('/api/templates').then((r) => r.json()),
    ]).then(([t, tmpl]) => {
      if (t.ok) setTree(t.data.filter((n: TreeNodeData) => n.type === 'folder'));
      if (tmpl.ok) setTemplates(tmpl.data);
    });
  }, [showPromote]);

  if (!card) return null;

  const save = async () => {
    const res = await fetch(`/api/cards/${card.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body: body || null, color }),
    });
    if (res.ok) {
      toast({ title: '저장 완료' });
      onChanged();
    } else {
      toast({ title: '저장 실패', variant: 'destructive' });
    }
  };

  const del = async () => {
    if (!window.confirm(`"${card.title}" 카드를 삭제할까요?`)) return;
    const res = await fetch(`/api/cards/${card.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ title: '카드 삭제' });
      onChanged();
    } else {
      toast({ title: '삭제 실패', variant: 'destructive' });
    }
  };

  const addComment = async () => {
    const text = draft.trim();
    if (!text) return;
    const res = await fetch(`/api/cards/${card.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text }),
    });
    const json = await res.json();
    if (res.ok && json.ok) {
      setComments((s) => [...s, json.data]);
      setDraft('');
    }
  };

  const promote = async () => {
    setPromoting(true);
    try {
      const res = await fetch(`/api/cards/${card.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId, templateId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || '승격 실패');
      toast({ title: '페이지로 변환 완료' });
      onChanged();
      router.push(`/pages/${json.data.pageId}`);
    } catch (e) {
      toast({
        title: '변환 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setPromoting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>카드 편집</DialogTitle>
          <DialogDescription>
            상세 내용 편집, 토론, 페이지로 승격(FR-605)이 가능합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>제목</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>내용</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
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
                    'h-7 w-7 rounded border-2',
                    c.bg,
                    c.border,
                    color === c.key && 'ring-2 ring-ring ring-offset-1',
                  )}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {card.linkedPageId ? (
            <div className="rounded border bg-secondary/40 px-3 py-2 text-xs">
              연결된 페이지:{' '}
              <Link href={`/pages/${card.linkedPageId}`} className="underline">
                바로가기 <ExternalLink className="inline h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div className="rounded border border-dashed px-3 py-2">
              {!showPromote ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPromote(true)}
                  className="text-xs"
                >
                  <Sparkles className="h-3.5 w-3.5" /> 페이지로 승격 (FR-605)
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs">대상 폴더</Label>
                    <select
                      value={parentId ?? ''}
                      onChange={(e) => setParentId(e.target.value || null)}
                      className="h-8 w-full rounded border bg-background px-2 text-sm"
                    >
                      <option value="">(최상위)</option>
                      {tree.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">템플릿 (선택)</Label>
                    <select
                      value={templateId ?? ''}
                      onChange={(e) => setTemplateId(e.target.value || null)}
                      className="h-8 w-full rounded border bg-background px-2 text-sm"
                    >
                      <option value="">(빈 문서 — 카드 내용으로 시작)</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={promote} disabled={promoting}>
                      {promoting ? '변환 중...' : '페이지로 변환'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowPromote(false)}
                      disabled={promoting}
                    >
                      취소
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <section>
            <Label className="text-xs">코멘트</Label>
            <div className="mt-2 space-y-2">
              {comments.length === 0 && (
                <p className="text-xs text-muted-foreground">아직 코멘트가 없습니다.</p>
              )}
              <ul className="space-y-2">
                {comments.map((c) => (
                  <li key={c.id} className="rounded border bg-secondary/30 px-3 py-1.5 text-sm">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>@{c.authorName}</span>
                      <span>·</span>
                      <span>{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-0.5">{c.body}</p>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="코멘트 입력 후 Enter"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void addComment();
                    }
                  }}
                />
                <Button size="sm" onClick={addComment} disabled={!draft.trim()}>
                  추가
                </Button>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="destructive" size="sm" onClick={del} className="mr-auto">
            <Trash2 className="h-3.5 w-3.5" /> 삭제
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button onClick={save}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
