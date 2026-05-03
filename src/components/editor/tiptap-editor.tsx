'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Mention from '@tiptap/extension-mention';
import { common, createLowlight } from 'lowlight';
import { DecisionNode } from '@/components/editor/decision-node';
import { InlineCommentMark, INLINE_COMMENT_CLICK_EVENT } from '@/components/comments/inline-comment-mark';
import { mentionSuggestion } from '@/components/comments/mention-suggestion';
import { CommentToolbar } from '@/components/comments/comment-toolbar';
import { PANEL_OPEN_EVENT, PANEL_RELOAD_EVENT } from '@/components/comments/comment-panel';
import { WikiLinkSuggestion } from '@/components/editor/wiki-link-suggestion';

import { Save, X, Loader2, FileText, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { EditLockBanner } from '@/components/page/edit-lock-banner';
import { EditorToolbar } from '@/components/editor/editor-toolbar';
import { SlashMenu } from '@/components/editor/slash-menu';
import { MarkdownView } from '@/components/page/markdown-view';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { markdownToHtml, htmlToMarkdown } from '@/lib/markdown-html';
import type { PageData } from '@/types';

interface Props {
  page: PageData;
}

const HEARTBEAT_MS = 60_000;
const AUTOSAVE_MS = 5_000;

const lowlight = createLowlight(common);

/**
 * TipTap 리치텍스트 에디터 (FR-201/202).
 *  - 블록 기반 WYSIWYG. 슬래시 명령어, 마크다운 입력 단축키, 표/체크박스/코드블록 지원
 *  - 마크다운 모드와 양방향 전환 가능 (FR-202)
 *  - Edit Lock 자동 acquire/heartbeat/release (FR-215)
 *  - 자동 저장 (5초 idle)
 *  - 클립보드 이미지 자동 업로드 (FR-1101)
 *
 * 저장 시: HTML → 마크다운(turndown) 변환해 Page.contentMarkdown 에 저장.
 *         원본 HTML/JSON 은 contentJson 에 보관해 향후 재편집 시 손실 최소화.
 */
export function TiptapEditor({ page }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(page.treeNode.title);
  const [mode, setMode] = useState<'rich' | 'markdown' | 'preview'>('rich');
  const [markdown, setMarkdown] = useState(page.contentMarkdown);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lockReady, setLockReady] = useState(false);

  const lastSavedMdRef = useRef(markdown);
  const titleSavedRef = useRef(title);
  const dirtyRef = useRef(false);

  // 슬래시 메뉴
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashPos, setSlashPos] = useState({ top: 0, left: 0 });
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* -------------------------------------------------- */
  /*  TipTap 초기화                                       */
  /* -------------------------------------------------- */
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // CodeBlockLowlight 로 대체
        heading: { levels: [1, 2, 3, 4] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({
        placeholder: '본문을 입력하세요. "/" 입력으로 명령 메뉴를 열 수 있습니다.',
      }),
      Highlight.configure({ multicolor: false }),
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true, HTMLAttributes: { class: 'pi-table' } }),
      TableRow,
      TableHeader,
      TableCell,
      CodeBlockLowlight.configure({ lowlight }),
      DecisionNode,
      InlineCommentMark,
      Mention.configure({
        HTMLAttributes: {
          class: 'pi-mention rounded bg-primary/10 px-1 font-medium text-primary',
        },
        renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id ?? ''}`,
        suggestion: mentionSuggestion,
      }),
      WikiLinkSuggestion,
    ],
    // 의도적으로 page.id 만 의존 — page.contentMarkdown 변경 시 재초기화하지 않음 (TipTap 자체 상태 보존)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    content: useMemo(() => markdownToHtml(page.contentMarkdown), [page.id]),
    editorProps: {
      attributes: {
        class:
          'pi-prose min-h-[60vh] w-full max-w-none rounded-md border bg-card p-6 outline-none focus:ring-1 focus:ring-ring',
      },
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items || []);
        const imgs = items.filter((it) => it.type.startsWith('image/'));
        if (imgs.length === 0) return false;
        event.preventDefault();
        for (const it of imgs) {
          const file = it.getAsFile();
          if (file) void uploadImage(file);
        }
        return true;
      },
      handleDrop(view, event) {
        const dt = event.dataTransfer;
        if (!dt) return false;
        const files = Array.from(dt.files).filter((f) => f.type.startsWith('image/'));
        if (files.length === 0) return false;
        event.preventDefault();
        for (const f of files) void uploadImage(f);
        return true;
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      // 슬래시 메뉴 트리거 처리
      const sel = editor.state.selection;
      const text = editor.state.doc.textBetween(Math.max(0, sel.from - 30), sel.from, '\n');
      const match = /(?:^|\s)\/(\w*)$/.exec(text);
      if (match) {
        setSlashQuery(match[1]);
        setSlashOpen(true);
        // 캐럿 좌표 계산
        const coords = editor.view.coordsAtPos(sel.from);
        const wrap = editorWrapRef.current?.getBoundingClientRect();
        if (wrap) {
          setSlashPos({ top: coords.bottom - wrap.top + 4, left: coords.left - wrap.left });
        }
      } else if (slashOpen) {
        setSlashOpen(false);
      }

      // dirty 마킹은 저장 시점에 markdown 으로 변환해 비교 (성능 트레이드오프)
      dirtyRef.current = true;
      setDirty(true);
    },
  });

  /* -------------------------------------------------- */
  /*  Edit Lock                                           */
  /* -------------------------------------------------- */
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

  useEffect(() => {
    if (!lockReady) return;
    const t = setInterval(() => {
      fetch(`/api/pages/${page.id}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'heartbeat' }),
      }).catch(() => undefined);
    }, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [page.id, lockReady]);

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

  /* -------------------------------------------------- */
  /*  저장 / 자동 저장                                     */
  /* -------------------------------------------------- */
  const computeMarkdown = useCallback((): string => {
    if (mode === 'markdown') return markdown;
    if (!editor) return markdown;
    const html = editor.getHTML();
    return htmlToMarkdown(html);
  }, [mode, markdown, editor]);

  const doSave = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (saving) return;
      setSaving(true);
      try {
        const md = computeMarkdown();
        const html = editor?.getHTML() ?? null;
        const res = await fetch(`/api/pages/${page.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            contentMarkdown: md,
            contentJson: html ? { html } : undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || '저장 실패');

        lastSavedMdRef.current = md;
        titleSavedRef.current = title;
        dirtyRef.current = false;
        setDirty(false);
        if (!opts.silent) toast({ title: '저장 완료' });
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
    [computeMarkdown, editor, page.id, saving, title],
  );

  // 자동 저장 (idle 5초)
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      void doSave({ silent: true });
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, title, markdown]);

  // Ctrl+S
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

  // 제목 변경 추적
  useEffect(() => {
    if (title !== titleSavedRef.current) {
      dirtyRef.current = true;
      setDirty(true);
    }
  }, [title]);

  // 마크다운 모드 변경 추적
  useEffect(() => {
    if (mode !== 'markdown') return;
    if (markdown !== lastSavedMdRef.current) {
      dirtyRef.current = true;
      setDirty(true);
    }
  }, [markdown, mode]);

  /* -------------------------------------------------- */
  /*  모드 전환                                           */
  /* -------------------------------------------------- */
  const switchMode = (next: 'rich' | 'markdown' | 'preview') => {
    if (next === mode) return;
    if (mode === 'rich' && next !== 'rich' && editor) {
      // rich → md/preview: html → md 변환해서 markdown 상태 동기화
      const md = htmlToMarkdown(editor.getHTML());
      setMarkdown(md);
    } else if (mode === 'markdown' && next === 'rich' && editor) {
      // md → rich: markdown → html 로 다시 채우기
      editor.commands.setContent(markdownToHtml(markdown), false);
    }
    setMode(next);
  };

  /* -------------------------------------------------- */
  /*  이미지 업로드                                        */
  /* -------------------------------------------------- */
  const uploadImage = useCallback(
    async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('pageId', page.id);
      try {
        const res = await fetch('/api/attachments', { method: 'POST', body: fd });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error || '업로드 실패');
        const att = json.data;
        const url = `/api/attachments/${att.id}`;

        if (mode === 'rich' && editor) {
          editor.chain().focus().setImage({ src: url, alt: att.filename }).run();
        } else {
          // 마크다운 모드: 커서 위치에 마크다운 이미지 삽입
          setMarkdown((s) => s + `\n\n![${att.filename}](${url})\n`);
        }
        toast({ title: '이미지 업로드 완료', description: att.filename });
      } catch (e) {
        toast({
          title: '이미지 업로드 실패',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      }
    },
    [editor, mode, page.id],
  );

  const onPickImage = () => {
    fileInputRef.current?.click();
  };

  /* -------------------------------------------------- */
  /*  인라인 코멘트 (FR-502)                              */
  /* -------------------------------------------------- */
  const onAddInlineComment = useCallback(
    async (range: { from: number; to: number; quote: string }) => {
      if (!editor) return;
      const initial = window.prompt('이 영역에 인라인 코멘트를 작성합니다.\n내용을 입력하세요:');
      if (!initial || !initial.trim()) return;
      try {
        const res = await fetch(`/api/pages/${page.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body: initial.trim(),
            anchorRange: { from: range.from, to: range.to, quote: range.quote },
          }),
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || '코멘트 등록 실패');
        const created = json.data as { id: string };

        // 선택 영역에 InlineCommentMark 적용
        editor
          .chain()
          .focus()
          .setTextSelection({ from: range.from, to: range.to })
          .setMark('inlineComment', { commentId: created.id, resolved: false })
          .run();

        // 패널 새로고침 + 해당 코멘트 강조
        window.dispatchEvent(new CustomEvent(PANEL_RELOAD_EVENT));
        window.dispatchEvent(
          new CustomEvent(PANEL_OPEN_EVENT, { detail: { commentId: created.id } }),
        );

        // 변경 사항 dirty 처리 → 자동 저장
        dirtyRef.current = true;
        setDirty(true);

        toast({ title: '인라인 코멘트 등록 완료' });
      } catch (e) {
        toast({
          title: '인라인 코멘트 실패',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      }
    },
    [editor, page.id],
  );

  // 본문에 부착된 InlineCommentMark 클릭 → 코멘트 패널 열기 이벤트 dispatch
  useEffect(() => {
    const onClick = (e: Event) => {
      const ce = e as CustomEvent<{ commentId: string }>;
      const commentId = ce.detail?.commentId;
      if (!commentId) return;
      window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT, { detail: { commentId } }));
    };
    window.addEventListener(INLINE_COMMENT_CLICK_EVENT, onClick as EventListener);
    return () => window.removeEventListener(INLINE_COMMENT_CLICK_EVENT, onClick as EventListener);
  }, []);

  /* -------------------------------------------------- */
  /*  취소 / 종료                                          */
  /* -------------------------------------------------- */
  const onCancel = async () => {
    if (dirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 정말 닫을까요?')) return;
    await fetch(`/api/pages/${page.id}/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'release' }),
    }).catch(() => undefined);
    router.push(`/pages/${page.id}`);
  };

  /* -------------------------------------------------- */
  /*  마크다운 모드용 paste 핸들러 (텍스트 영역에서 이미지)   */
  /* -------------------------------------------------- */
  const onMdPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items || []);
    const imgs = items.filter((it) => it.type.startsWith('image/'));
    if (imgs.length === 0) return;
    e.preventDefault();
    for (const it of imgs) {
      const file = it.getAsFile();
      if (file) void uploadImage(file);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4" ref={editorWrapRef}>
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
            <X className="h-4 w-4" /> 닫기
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Tabs value={mode} onValueChange={(v) => switchMode(v as typeof mode)}>
            <TabsList>
              <TabsTrigger value="rich">
                <Layers className="mr-1 h-3.5 w-3.5" /> 리치텍스트
              </TabsTrigger>
              <TabsTrigger value="markdown">
                <FileText className="mr-1 h-3.5 w-3.5" /> 마크다운
              </TabsTrigger>
              <TabsTrigger value="preview">미리보기</TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="text-xs text-muted-foreground">
            {dirty ? '● 변경됨 (자동 저장 5초 대기)' : '✓ 저장됨'}
          </span>
        </div>

        {mode === 'rich' && (
          <>
            <EditorToolbar editor={editor} onUploadImage={onPickImage} />
            <div className="relative">
              <EditorContent editor={editor} />
              {editor && (
                <>
                  <SlashMenu
                    editor={editor}
                    open={slashOpen}
                    query={slashQuery}
                    position={slashPos}
                    onClose={() => setSlashOpen(false)}
                    onPickImage={onPickImage}
                  />
                  <CommentToolbar editor={editor} onAddComment={onAddInlineComment} />
                </>
              )}
            </div>
          </>
        )}

        {mode === 'markdown' && (
          <Textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            onPaste={onMdPaste}
            className="min-h-[60vh] font-mono text-sm leading-relaxed"
            placeholder="# 제목&#10;&#10;마크다운 형식으로 작성하세요. 이미지는 클립보드 붙여넣기로 자동 업로드됩니다."
          />
        )}

        {mode === 'preview' && (
          <div className="min-h-[60vh] rounded-md border bg-card p-6">
            <MarkdownView source={mode === 'preview' ? markdown : computeMarkdown()} />
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadImage(f);
            e.target.value = '';
          }}
        />
      </div>
    </TooltipProvider>
  );
}
