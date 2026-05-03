'use client';

/**
 * 첨부 파일 업로더 — FR-1101 / FR-1104
 *
 * - 드래그앤드롭 / 파일 선택 / 클립보드 붙여넣기 모두 지원
 * - mode='image' : 이미지 전용 (에디터 본문에서 사용)
 * - mode='file'  : 이미지 외 일반 파일 (첨부 패널에서 사용)
 * - mode='all'   : 모든 파일 허용
 * - 진행 상태와 에러를 인라인으로 표시
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadCloud, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatBytes } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';

export type AttachmentDTO = {
  id: string;
  filename: string;
  mimeType: string;
  fileType: 'image' | 'pdf' | 'excel' | 'word' | 'ppt' | 'zip' | 'text' | 'other';
  path: string;
  size: number;
  pageId: string | null;
  uploaderName: string;
  createdAt: string;
};

interface Props {
  pageId?: string | null;
  mode: 'image' | 'file' | 'all';
  onUploaded: (att: AttachmentDTO) => void;
  maxSizeMB?: number;
  className?: string;
  /** 컴팩트 표시 (높이 축소) */
  compact?: boolean;
  /** 외부 트리거에서 파일 선택 다이얼로그를 열기 위한 key — 변경 시 input.click() */
  triggerOpen?: number;
}

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];

function acceptAttr(mode: Props['mode']): string {
  if (mode === 'image') return 'image/*';
  if (mode === 'all') return '*/*';
  // file 모드: 이미지 제외 일반 파일
  return [
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed',
    'text/csv',
    'text/plain',
    '.txt,.md,.log,.json,.xml,.yaml,.yml,.7z,.tar,.gz',
  ].join(',');
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTS.includes(ext);
}

export function UploadDropzone({
  pageId,
  mode,
  onUploaded,
  maxSizeMB,
  className,
  compact = false,
  triggerOpen,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ name: string; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const limitMB = maxSizeMB ?? (mode === 'image' ? 10 : 50);

  const upload = useCallback(
    async (file: File) => {
      setError(null);

      if (mode === 'image' && !isImageFile(file)) {
        setError('이미지 파일만 업로드할 수 있습니다.');
        return;
      }
      if (mode === 'file' && isImageFile(file)) {
        setError('이미지는 본문 에디터에서 직접 붙여넣어 주세요.');
        return;
      }
      if (file.size > limitMB * 1024 * 1024) {
        setError(`파일이 ${limitMB}MB 를 초과합니다 (${formatBytes(file.size)})`);
        return;
      }

      setBusy(true);
      setProgress({ name: file.name, percent: 0 });
      try {
        const att = await uploadWithProgress(file, pageId ?? null, (p) => {
          setProgress({ name: file.name, percent: p });
        });
        onUploaded(att);
        toast({ title: '업로드 완료', description: file.name });
      } catch (e) {
        const msg = e instanceof Error ? e.message : '업로드 실패';
        setError(msg);
        toast({ title: '업로드 실패', description: msg, variant: 'destructive' });
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [mode, pageId, limitMB, onUploaded],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      for (const f of arr) {
        // eslint-disable-next-line no-await-in-loop
        await upload(f);
      }
    },
    [upload],
  );

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) {
        await handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const onPaste = useCallback(
    async (e: React.ClipboardEvent<HTMLDivElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i];
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        await handleFiles(files);
      }
    },
    [handleFiles],
  );

  // 외부 triggerOpen 변경 시 파일 선택 다이얼로그 열기 (triggerOpen 미설정 시 무시)
  useEffect(() => {
    if (triggerOpen === undefined) return;
    inputRef.current?.click();
  }, [triggerOpen]);

  return (
    <div
      className={cn(
        'relative rounded-lg border-2 border-dashed bg-card p-6 text-center transition-colors',
        dragOver ? 'border-primary bg-accent' : 'border-border',
        compact && 'p-3',
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onPaste={onPaste}
      tabIndex={0}
      role="button"
      aria-label="파일 업로드 영역"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={acceptAttr(mode)}
        multiple
        onChange={(e) => {
          if (e.target.files?.length) {
            void handleFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {busy ? (
        <div className="flex flex-col items-center gap-2 text-sm">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">
            업로드 중… {progress ? `${progress.name} (${progress.percent}%)` : ''}
          </span>
        </div>
      ) : (
        <div className={cn('flex flex-col items-center gap-2', compact && 'gap-1')}>
          <UploadCloud
            className={cn('text-muted-foreground', compact ? 'h-5 w-5' : 'h-7 w-7')}
            aria-hidden
          />
          <p className={cn('text-foreground', compact ? 'text-xs' : 'text-sm')}>
            {mode === 'image'
              ? '이미지를 끌어다 놓거나 붙여넣으세요'
              : '파일을 끌어다 놓거나 붙여넣으세요'}
          </p>
          {!compact && (
            <p className="text-xs text-muted-foreground">
              개별 {limitMB}MB 이하 · 클릭하여 파일 선택
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            파일 선택
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-center justify-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/** XHR 기반 업로드 (진행률 콜백 포함) */
function uploadWithProgress(
  file: File,
  pageId: string | null,
  onProgress: (percent: number) => void,
): Promise<AttachmentDTO> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    if (pageId) fd.append('pageId', pageId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/attachments');
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && json?.ok && json?.data) {
          resolve(json.data as AttachmentDTO);
        } else {
          reject(new Error(json?.error || `업로드 실패 (HTTP ${xhr.status})`));
        }
      } catch {
        reject(new Error(`업로드 실패 (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('네트워크 오류'));
    xhr.send(fd);
  });
}
