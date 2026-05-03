'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { MarkdownView } from '@/components/page/markdown-view';
import { EditLockBanner } from '@/components/page/edit-lock-banner';
import { toast } from '@/components/ui/use-toast';
import type { AttachmentDTO } from '@/components/attachments/upload-dropzone';
import type { PageData } from '@/types';

interface Props {
  page: PageData;
}

const HEARTBEAT_MS = Number(process.env.NEXT_PUBLIC_LOCK_HEARTBEAT_MS ?? 60_000);
const AUTOSAVE_MS = 5_000;

/**
 * Sprint 1 마크다운 에디터.
 *  - 좌: 마크다운 입력
 *  - 우: 실시간 미리보기 (탭 전환)
 *  - Edit Lock 자동 acquire/heartbeat/release
 *  - 자동 저장 (5초 idle)
 *
 * Sprint 2: TipTap 기반 리치텍스트 에디터로 교체 예정 (src/components/editor/tiptap-editor.tsx).
 */
export function MarkdownEditor({ page }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(page.treeNode.title);
  const [body, setBody] = useState(page.contentMarkdown);
  const [tab, setTab] = useState<'edit' | 'preview' | 'split'>('split');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lockReady, setLockReady] = useState(false);

  const dirtyRef = useRef(false);
  const lastSavedRef = useRef(body);
  const titleSavedRef = useRef(title);

  /**
   * 클립보드에 이미지가 있으면 /api/attachments 로 업로드 후
   * 마크다운에 `![](/api/attachments/<id>)` 를 커서 위치에 삽입.
   * 일반 텍스트 붙여넣기는 그대로 둔다 (preventDefault 안 함).
   */
  const onPasteImage = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i];
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (imageFiles.length === 0) return;
      e.preventDefault();

      const ta = e.currentTarget;
      for (const file of imageFiles) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('pageId', page.id);
          const res = await fetch('/api/attachments', { method: 'POST', body: fd });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json?.ok) {
            throw new Error(json?.error || `업로드 실패 (HTTP ${res.status})`);
          }
          const att = json.data as AttachmentDTO;
          const md = `![${att.filename}](/api/attachments/${att.id})`;

          // 커서 위치에 삽입
          const start = ta.selectionStart ?? body.length;
          const end = ta.selectionEnd ?? body.length;
          const before = body.slice(0, start);
          const after = body.slice(end);
          const next = `${before}${md}${after}`;
          setBody(next);
          // 커서를 삽입 직후로 이동 (다음 tick)
          setTimeout(() => {
            const pos = before.length + md.length;
            ta.focus();
            ta.setSelectionRange(pos, pos);
          }, 0);
          toast({ title: '이미지 업로드 완료', description: att.filename });
        } catch (err) {
          toast({
            title: '이미지 업로드 실패',
            description: err instanceof Error ? err.message : '',
            variant: 'destructive',
          });
        }
      }
    },
    [body, page.id],
  );

  // 1) 진입 시 Lock 획득
  useEffect(() => {
    let aborted = false;
    (async () => {
      const res = await fetch(`/api/pages/${page.id}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acquire' }),
      });
      const json = await res.json();
      if (aborted) return;
      if (!res.ok) {
        toast({
          title: '편집 잠금 획득 실패',
          description: json?.error,
          variant: 'destructive',
        });
        router.push(`/pages/${page.id}`);
        return;
      }
      setLockReady(true);
    })();
    return () => {
      aborted = true;
    };
  }, [page.id, router]);

  // 2) Heartbeat
  useEffect(() => {
    if (!lockReady) return;
    const t = setInterval(() => {
      fetch(`/api/pages/${page.id}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'heartbeat' }),
      });
    }, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [page.id, lockReady]);

  // 3) 페이지 이탈 시 Lock 해제
  useEffect(() => {
    const release = () => {
      navigator.sendBeacon(
        `/api/pages/${page.id}/lock`,
        new Blob([JSON.stringify({ action: 'release' })], { type: 'application/json' }),
      );
    };
    window.addEventListener('beforeunload', release);
    return () => {
      release();
      window.removeEventListener('beforeunload', release);
    };
  }, [page.id]);

  // 4) 변경 시 dirty
  useEffect(() => {
    const changed = body !== lastSavedRef.current || title !== titleSavedRef.current;
    setDirty(changed);
    dirtyRef.current = changed;
  }, [body, title]);

  // 5) 자동 저장 (5초 idle 후)
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      void doSave({ silent: true });
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, title, dirty]);

  const doSave = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (saving) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/pages/${page.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            contentMarkdown: body,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || '저장 실패');
        }
        lastSavedRef.current = body;
        titleSavedRef.current = title;
        dirtyRef.current = false;
        setDirty(false);
        if (!opts.silent) {
          toast({ title: '저장 완료' });
        }
      } catch (e) {
        toast({
          title: '저장 실패',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      } finally {
        setSaving(false);
      }
    },
    [body, title, page.id, saving],
  );

  // 6) Ctrl+S 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void doSave({});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doSave]);

  const onCancel = async () => {
    if (dirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 정말 닫을까요?')) return;
    await fetch(`/api/pages/${page.id}/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'release' }),
    });
    router.push(`/pages/${page.id}`);
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4">
      <EditLockBanner pageId={page.id} mode="edit" />

      <div className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-10 text-lg font-semibold"
          placeholder="페이지 제목"
        />
        <Button onClick={() => doSave({})} disabled={saving || !lockReady}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          저장
        </Button>
        <Button variant="outline" onClick={onCancel}>
          <X className="h-4 w-4" />
          닫기
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="edit">편집</TabsTrigger>
            <TabsTrigger value="split">분할</TabsTrigger>
            <TabsTrigger value="preview">미리보기</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="text-xs text-muted-foreground">
          {dirty ? '● 변경됨 (자동 저장 5초 대기)' : '✓ 저장됨'}
        </span>
      </div>

      {tab === 'edit' && (
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onPaste={onPasteImage}
          className="min-h-[60vh] font-mono text-sm leading-relaxed"
          placeholder="# 제목&#10;&#10;마크다운 형식으로 작성하세요. **굵게**, *기울임*, `코드` 등 지원. 이미지는 붙여넣기로 업로드 가능."
        />
      )}

      {tab === 'preview' && (
        <div className="min-h-[60vh] rounded-md border bg-card p-6">
          <MarkdownView source={body} pageId={page.id} />
        </div>
      )}

      {tab === 'split' && (
        <div className="grid min-h-[60vh] grid-cols-1 gap-3 lg:grid-cols-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={onPasteImage}
            className="min-h-[60vh] font-mono text-sm leading-relaxed"
            placeholder="# 제목&#10;&#10;마크다운 형식으로 작성하세요. 이미지는 붙여넣기로 업로드 가능."
          />
          <div className="min-h-[60vh] overflow-auto rounded-md border bg-card p-6">
            <MarkdownView source={body} pageId={page.id} />
          </div>
        </div>
      )}
    </div>
  );
}
