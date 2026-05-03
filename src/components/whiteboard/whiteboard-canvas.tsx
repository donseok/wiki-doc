'use client';

import 'tldraw/tldraw.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Tldraw, type Editor } from 'tldraw';
import { Save, Loader2, FileText, Image as ImageIcon, Layers, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { toastError } from '@/lib/toast-error';
import { downloadBlob } from '@/lib/download';
import { WHITEBOARD_TEMPLATES, getTemplate } from './whiteboard-templates';
import { WhiteboardCommentsPanel } from './whiteboard-comments-panel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConvertToPageDialog } from './convert-to-page-dialog';

interface Props {
  whiteboardId: string;
  initialTitle: string;
  initialSnapshot: unknown | null;
  currentUser?: string;
}

const AUTOSAVE_MS = 5_000;

/**
 * tldraw 기반 무한 캔버스 — FR-1201~1213
 *
 * - 진입 시 DB 의 viewportJson(=tldraw snapshot) 로드
 * - 변경 발생 시 5초 idle 자동 저장
 * - 상단 우측 툴바: 페이지 변환 / PNG 내보내기 / 템플릿 선택 / 투표 모드
 * - 화이트보드 → 페이지 변환은 ConvertToPageDialog 가 담당
 *
 * 단순화 결정: 자체 sticky/frame 모델 대신 tldraw 의 기본 도구를 활용한다.
 * - 포스트잇 = tldraw 'note' shape (7색 native 지원)
 * - 그룹 박스 = tldraw 'frame' shape
 * - 화살표/도형/텍스트 = tldraw 기본
 * - 이모지 스티커 = note + emoji text (단순)
 */
export function WhiteboardCanvas({
  whiteboardId,
  initialTitle,
  initialSnapshot,
  currentUser = '익명',
}: Props) {
  const editorRef = useRef<Editor | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const dirtyRef = useRef(false);
  const lastSavedAtRef = useRef<number>(Date.now());

  // dirtyRef 는 setInterval 의 stale closure 회피용, dirty 는 렌더용. 항상 함께 갱신.
  const setDirtyBoth = useCallback((v: boolean) => {
    dirtyRef.current = v;
    setDirty(v);
  }, []);

  const doSave = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const editor = editorRef.current;
      if (!editor || saving) return;
      setSaving(true);
      try {
        const snapshot = editor.store.getStoreSnapshot();
        const res = await fetch(`/api/whiteboards/${whiteboardId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewportJson: snapshot }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || '저장 실패');
        }
        setDirtyBoth(false);
        lastSavedAtRef.current = Date.now();
        if (!opts.silent) toast({ title: '저장 완료' });
      } catch (e) {
        toastError('저장 실패', e);
      } finally {
        setSaving(false);
      }
    },
    [saving, whiteboardId, setDirtyBoth],
  );

  useEffect(() => {
    const t = setInterval(() => {
      if (dirtyRef.current && Date.now() - lastSavedAtRef.current > AUTOSAVE_MS) {
        void doSave({ silent: true });
      }
    }, 2_000);
    return () => clearInterval(t);
  }, [doSave]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => () => unsubscribeRef.current?.(), []);

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

  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      if (initialSnapshot && typeof initialSnapshot === 'object') {
        try {
          editor.store.loadStoreSnapshot(initialSnapshot as any);
        } catch (e) {
          console.warn('[Whiteboard] snapshot 로드 실패, 빈 캔버스로 시작', e);
        }
      }

      // tldraw onMount 의 cleanup 반환 계약이 버전마다 달라, ref + 별도 effect 로 보장.
      unsubscribeRef.current = editor.store.listen(
        () => setDirtyBoth(true),
        { source: 'user', scope: 'document' },
      );
    },
    [initialSnapshot, setDirtyBoth],
  );

  const applyTemplate = (key: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const tmpl = getTemplate(key);
    if (!tmpl) return;
    if (
      editor.getCurrentPageShapes().length > 0 &&
      !window.confirm('현재 캔버스의 내용은 유지되고, 템플릿이 추가됩니다. 계속할까요?')
    )
      return;
    try {
      editor.createShapes(tmpl.build() as never);
      toast({ title: `템플릿 적용: ${tmpl.name}` });
    } catch (e) {
      toastError('템플릿 적용 실패', e);
    }
  };

  // PNG 내보내기 (FR-1212)
  const exportPng = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const shapeIds = editor.getCurrentPageShapeIds();
      if (shapeIds.size === 0) {
        toast({ title: '내보낼 내용이 없습니다', variant: 'destructive' });
        return;
      }
      const result = await editor.toImage([...shapeIds], { format: 'png', background: true });
      if (!result) {
        toast({ title: 'PNG 생성 실패', variant: 'destructive' });
        return;
      }
      const safeTitle = initialTitle.replace(/[\\/:*?"<>|]/g, '_');
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(result.blob, `${safeTitle}-${stamp}.png`);
      toast({ title: 'PNG 내보내기 완료' });
    } catch (e) {
      toastError('PNG 내보내기 실패', e);
    }
  };

  // 페이지 변환 (FR-1209)
  const startConvert = () => {
    if (dirty) {
      if (window.confirm('변경사항을 먼저 저장하고 변환할까요?')) {
        void doSave({ silent: true }).then(() => setConvertOpen(true));
        return;
      }
    }
    setConvertOpen(true);
  };

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* 상단 액션 바 */}
      <div className="flex items-center gap-2 border-b bg-card px-3 py-1.5">
        <h2 className="text-sm font-semibold">{initialTitle}</h2>
        <span className="ml-2 text-xs text-muted-foreground">
          {saving ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> 저장 중...
            </span>
          ) : dirty ? (
            '● 변경됨 (자동 저장 5초)'
          ) : (
            '✓ 저장됨'
          )}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                <Layers className="h-4 w-4" />
                템플릿
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs">시작 템플릿 (FR-1213)</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {WHITEBOARD_TEMPLATES.map((t) => (
                <DropdownMenuItem key={t.key} onClick={() => applyTemplate(t.key)}>
                  <span className="flex flex-col">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-xs text-muted-foreground">{t.description}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            variant={commentsOpen ? 'default' : 'ghost'}
            onClick={() => setCommentsOpen((s) => !s)}
            title="코멘트 (FR-1211)"
          >
            <MessageCircle className="h-4 w-4" />
            코멘트
          </Button>

          <Button size="sm" variant="ghost" onClick={exportPng} title="PNG 내보내기 (FR-1212)">
            <ImageIcon className="h-4 w-4" />
            PNG
          </Button>

          <Button size="sm" variant="outline" onClick={startConvert} title="페이지로 변환 (FR-1209)">
            <FileText className="h-4 w-4" />
            페이지로 변환
          </Button>

          <Button size="sm" onClick={() => doSave({})} disabled={saving}>
            <Save className="h-4 w-4" />
            저장
          </Button>
        </div>
      </div>

      {/* 캔버스 — 남은 공간 전부 (코멘트 패널이 absolute 로 우측 오버레이) */}
      <div className="relative flex-1">
        <Tldraw onMount={onMount} hideUi={false} persistenceKey={undefined} />
        <WhiteboardCommentsPanel
          whiteboardId={whiteboardId}
          currentUser={currentUser}
          open={commentsOpen}
          onOpenChange={setCommentsOpen}
        />
      </div>

      <ConvertToPageDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        whiteboardId={whiteboardId}
        title={initialTitle}
      />
    </div>
  );
}
