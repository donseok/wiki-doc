'use client';

/**
 * 마크다운 일괄 가져오기 섹션 — FR-808 / Round 4
 *
 * /admin 페이지의 5번째 탭 본체. zip 1개 또는 다중 .md 파일 업로드 후
 * /api/admin/import POST 로 일괄 등록한다. XHR 진행률 + 결과 리포트.
 *
 * 계약: _workspace/02_pm_api_contract.md (응답 shape · 한도 · 에러 코드)
 * UX:   _workspace/03_designer_spec.md  (상태 매트릭스 · 색 · 카피 · a11y)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download as DownloadIcon,
  FileArchive,
  FileText,
  FolderPlus,
  Loader2,
  MinusCircle,
  RefreshCcw,
  RotateCcw,
  Trash2,
  Upload as UploadIcon,
  UploadCloud,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { toastError } from '@/lib/toast-error';
import { cn, formatBytes, getCurrentUser } from '@/lib/utils';
import type { PageStatus } from '@/types';
import { WorkspacePicker } from '@/components/admin/workspace-picker';

// =====================================================================
// 계약 타입 (02_pm_api_contract.md)
// =====================================================================

type ConflictPolicy = 'skip' | 'overwrite' | 'rename';
type ImportAction = 'created' | 'skipped' | 'overwritten' | 'renamed' | 'failed';

interface ImportSummary {
  created: number;
  skipped: number;
  failed: number;
  foldersCreated: number;
}

interface ImportDetail {
  path: string;
  action: ImportAction;
  pageId?: string;
  title?: string;
  tagsApplied?: string[];
  reason?: string;
}

interface ImportResultDto {
  summary: ImportSummary;
  details: ImportDetail[];
  targetNodeId: string;
  mode: 'zip' | 'files';
}

type Phase = 'idle' | 'uploading' | 'processing' | 'success' | 'error';
type DropMode = 'idle' | 'zip' | 'files';

// 한도 (env 와 일치 — 클라 측 사전 검증용. 서버가 진짜 게이트키퍼)
const MAX_ZIP_BYTES = 50 * 1024 * 1024;
const MAX_FILES_COUNT = 500;
const STATUS_VALUES: PageStatus[] = ['Draft', 'Review', 'Approved', 'Pending', 'Archived'];

const POLICY_OPTIONS: Array<{
  value: ConflictPolicy;
  label: string;
  description: string;
  emphasized?: boolean;
}> = [
  { value: 'skip', label: '스킵 (기본)', description: '동일 제목이 있으면 건너뜁니다' },
  {
    value: 'overwrite',
    label: '덮어쓰기',
    description: '기존 본문을 갱신하고 새 버전을 만듭니다',
    emphasized: true,
  },
  { value: 'rename', label: '리네임', description: '새 페이지를 -2, -3 … 접미사로 만듭니다' },
];

// =====================================================================
// 메인
// =====================================================================

export function ImportSection() {
  const router = useRouter();

  // --- 파일 입력 -----------------------------------------------------
  const [mode, setMode] = useState<DropMode>('idle');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [mdFiles, setMdFiles] = useState<File[]>([]);

  // --- 옵션 ---------------------------------------------------------
  const [targetNodeId, setTargetNodeId] = useState<string>('');
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>('skip');
  const [preserveFolders, setPreserveFolders] = useState<boolean>(true);
  const [defaultAuthor, setDefaultAuthor] = useState<string>('');
  const [defaultStatus, setDefaultStatus] = useState<PageStatus>('Draft');

  // --- 실행 ---------------------------------------------------------
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [result, setResult] = useState<ImportResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState<ImportAction | 'all'>('all');
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // 다중 파일 모드에서는 폴더 보존 강제 OFF (계약: 무시되지만 UI 일관성)
  useEffect(() => {
    if (mode === 'files' && preserveFolders) setPreserveFolders(false);
    if (mode === 'zip' && !preserveFolders && phase === 'idle') {
      // zip 모드 진입 시 기본값 ON 복원 (사용자가 수동으로 끄고 다시 다중→zip 전환한 경우)
      // 단, idle 상태일 때만 — 이미 사용자가 의식적으로 OFF 한 것을 덮어쓰지 않음
    }
  }, [mode, preserveFolders, phase]);

  const totalSelectedBytes = useMemo(() => {
    if (mode === 'zip' && zipFile) return zipFile.size;
    if (mode === 'files') return mdFiles.reduce((s, f) => s + f.size, 0);
    return 0;
  }, [mode, zipFile, mdFiles]);

  const fileCountClient = mode === 'zip' ? (zipFile ? 1 : 0) : mdFiles.length;
  const overFileLimit = mode === 'files' && mdFiles.length > MAX_FILES_COUNT;
  const overZipLimit = mode === 'zip' && zipFile !== null && zipFile.size > MAX_ZIP_BYTES;

  const canRun =
    phase === 'idle' &&
    !overFileLimit &&
    !overZipLimit &&
    ((mode === 'zip' && zipFile !== null) || (mode === 'files' && mdFiles.length > 0));

  const summaryLine = (() => {
    if (mode === 'zip' && zipFile) return `zip 1개 (${formatBytes(zipFile.size)})`;
    if (mode === 'files' && mdFiles.length > 0)
      return `파일 ${mdFiles.length}개 선택됨 (총 ${formatBytes(totalSelectedBytes)})`;
    return '파일을 선택하세요';
  })();

  const onSelectFiles = useCallback((next: { mode: DropMode; zipFile?: File | null; mdFiles?: File[] }) => {
    setMode(next.mode);
    setZipFile(next.zipFile ?? null);
    setMdFiles(next.mdFiles ?? []);
  }, []);

  const resetSelection = () => {
    setMode('idle');
    setZipFile(null);
    setMdFiles([]);
  };

  const resetAll = () => {
    resetSelection();
    setError(null);
    setResult(null);
    setProgress(0);
    setPhase('idle');
    setResultFilter('all');
  };

  /** 결과만 닫고 옵션/파일은 보존 */
  const dismissResult = () => {
    setResult(null);
    setError(null);
    setResultFilter('all');
    setPhase('idle');
    setProgress(0);
  };

  /** 새로 가져오기 — 파일은 클리어, 옵션은 보존 (designer §16-4 권장) */
  const startOver = () => {
    resetSelection();
    setResult(null);
    setError(null);
    setProgress(0);
    setPhase('idle');
    setResultFilter('all');
  };

  // ---------------------------------------------------------------
  // 업로드 (XHR + progress)
  // ---------------------------------------------------------------

  const run = useCallback(() => {
    if (!canRun) return;

    const fd = new FormData();
    const meta: Record<string, unknown> = {
      targetNodeId,
      conflictPolicy,
      preserveFolders: mode === 'zip' ? preserveFolders : false,
      defaultStatus,
    };
    if (defaultAuthor.trim()) meta.defaultAuthor = defaultAuthor.trim();
    fd.append('meta', JSON.stringify(meta));

    if (mode === 'zip' && zipFile) {
      fd.append('file', zipFile);
    } else {
      for (const f of mdFiles) fd.append('files', f);
    }

    setPhase('uploading');
    setProgress(0);
    setResult(null);
    setError(null);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('POST', '/api/admin/import');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.upload.addEventListener('load', () => {
      // 업로드 완료, 서버 처리 단계로 전환
      setProgress(100);
      setPhase('processing');
    });
    xhr.onload = () => {
      xhrRef.current = null;
      let json: { ok: boolean; data?: ImportResultDto; error?: string } | null = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        json = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && json?.ok && json.data) {
        setResult(json.data);
        setPhase('success');
        // 사이드바 트리(서버 컴포넌트) 갱신
        router.refresh();
        const s = json.data.summary;
        toast({
          title: '가져오기 완료',
          description: `생성 ${s.created} · 스킵 ${s.skipped} · 실패 ${s.failed}`,
        });
      } else {
        const msg = json?.error ?? `요청 실패 (HTTP ${xhr.status})`;
        setError(msg);
        setPhase('error');
        toast({ title: '가져오기 실패', description: msg, variant: 'destructive' });
      }
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      const msg = '네트워크 오류가 발생했습니다. 연결을 확인하고 다시 시도해주세요.';
      setError(msg);
      setPhase('error');
      toastError('네트워크 오류', new Error(msg));
    };
    xhr.onabort = () => {
      xhrRef.current = null;
      setPhase('idle');
      setProgress(0);
      toast({ title: '업로드가 취소되었습니다' });
    };

    xhr.send(fd);
  }, [
    canRun,
    targetNodeId,
    conflictPolicy,
    preserveFolders,
    defaultAuthor,
    defaultStatus,
    mode,
    zipFile,
    mdFiles,
    router,
  ]);

  const cancelUpload = () => {
    if (!xhrRef.current) return;
    if (!window.confirm('업로드를 취소하시겠습니까?')) return;
    xhrRef.current.abort();
  };

  // 컴포넌트 unmount 시 진행 중 XHR abort
  useEffect(
    () => () => {
      xhrRef.current?.abort();
    },
    [],
  );

  // ---------------------------------------------------------------
  // 결과 보조 액션 (JSON 복사, CSV 다운로드)
  // ---------------------------------------------------------------

  const copyResultJson = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      toast({ title: '결과 JSON 을 클립보드에 복사했습니다.' });
    } catch (e) {
      toastError('복사 실패', e);
    }
  };

  const downloadResultCsv = () => {
    if (!result) return;
    const header = ['path', 'action', 'title', 'tags', 'pageId', 'reason'];
    const escape = (v: unknown) => {
      const s = v === undefined || v === null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = result.details.map((d) =>
      [
        d.path,
        d.action,
        d.title ?? '',
        (d.tagsApplied ?? []).join('|'),
        d.pageId ?? '',
        d.reason ?? '',
      ]
        .map(escape)
        .join(','),
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `import-result-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-4">
      <ImportHeader />

      <ImportDropzone
        mode={mode}
        zipFile={zipFile}
        mdFiles={mdFiles}
        disabled={phase === 'uploading' || phase === 'processing'}
        onSelect={onSelectFiles}
        onClear={resetSelection}
        overFileLimit={overFileLimit}
        overZipLimit={overZipLimit}
      />

      <ImportOptions
        targetNodeId={targetNodeId}
        onTargetChange={setTargetNodeId}
        conflictPolicy={conflictPolicy}
        onConflictPolicyChange={setConflictPolicy}
        preserveFolders={preserveFolders}
        onPreserveFoldersChange={setPreserveFolders}
        defaultAuthor={defaultAuthor}
        onDefaultAuthorChange={setDefaultAuthor}
        defaultStatus={defaultStatus}
        onDefaultStatusChange={setDefaultStatus}
        mode={mode}
        disabled={phase === 'uploading' || phase === 'processing'}
      />

      <ImportRunBar
        summaryLine={summaryLine}
        canRun={canRun}
        phase={phase}
        progress={progress}
        currentLabel={
          mode === 'zip' && zipFile
            ? `${zipFile.name} 업로드 중`
            : mode === 'files' && mdFiles.length > 0
              ? `${mdFiles.length}개 파일 업로드 중`
              : '업로드 중'
        }
        onRun={run}
        onReset={resetAll}
        onCancel={cancelUpload}
        fileCountClient={fileCountClient}
      />

      {phase === 'error' && error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
          <div className="flex-1 space-y-1">
            <p className="font-medium">가져오기 실패</p>
            <p className="text-xs leading-relaxed">{error}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={dismissResult}
            aria-label="에러 닫기"
            className="text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {phase === 'success' && result && (
        <ImportResultPanel
          result={result}
          filter={resultFilter}
          onFilterChange={setResultFilter}
          onCopyJson={copyResultJson}
          onDownloadCsv={downloadResultCsv}
          onStartOver={startOver}
        />
      )}
    </section>
  );
}

// =====================================================================
// 헤더
// =====================================================================

function ImportHeader() {
  return (
    <div className="space-y-2 rounded-lg border bg-card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <UploadCloud className="h-4 w-4 text-emerald-500" aria-hidden />
        마크다운 일괄 가져오기
      </h2>
      <p className="text-xs text-muted-foreground">
        zip 파일 또는 다중 .md 파일을 한 번에 트리에 등록합니다. YAML frontmatter 의{' '}
        <code className="rounded bg-muted px-1 text-[11px]">title</code> /{' '}
        <code className="rounded bg-muted px-1 text-[11px]">tags</code> /{' '}
        <code className="rounded bg-muted px-1 text-[11px]">author</code> /{' '}
        <code className="rounded bg-muted px-1 text-[11px]">status</code> 가 자동 추출됩니다.
      </p>
      <p className="text-[11px] text-muted-foreground">
        한도: zip 50MB · 파일 500개 · 단일 1MB · 권한:{' '}
        <code className="rounded bg-muted px-1 text-[11px]">IMPORT_ALLOWED_USERS</code> 환경변수에
        등록된 사용자만 사용 가능 (빈 값이면 모두 허용)
      </p>
    </div>
  );
}

// =====================================================================
// 드롭존
// =====================================================================

interface DropzoneProps {
  mode: DropMode;
  zipFile: File | null;
  mdFiles: File[];
  disabled: boolean;
  onSelect: (next: { mode: DropMode; zipFile?: File | null; mdFiles?: File[] }) => void;
  onClear: () => void;
  overFileLimit: boolean;
  overZipLimit: boolean;
}

function classifyFiles(
  files: File[],
): { mode: DropMode; zipFile?: File; mdFiles?: File[]; reject?: string } {
  if (files.length === 0) return { mode: 'idle' };
  const zips: File[] = [];
  const mds: File[] = [];
  const others: string[] = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.zip')) zips.push(f);
    else if (lower.endsWith('.md') || lower.endsWith('.markdown')) mds.push(f);
    else others.push(f.name);
  }
  if (others.length > 0) {
    return { mode: 'idle', reject: '지원하지 않는 형식입니다 (.zip 또는 .md 만 허용)' };
  }
  if (zips.length > 0 && mds.length > 0) {
    return { mode: 'idle', reject: 'zip 1개 또는 .md 파일 N개 중 하나만 선택해주세요' };
  }
  if (zips.length > 1) {
    return { mode: 'idle', reject: 'zip 파일은 1개만 업로드할 수 있습니다' };
  }
  if (zips.length === 1) return { mode: 'zip', zipFile: zips[0] };
  return { mode: 'files', mdFiles: mds };
}

function ImportDropzone({
  mode,
  zipFile,
  mdFiles,
  disabled,
  onSelect,
  onClear,
  overFileLimit,
  overZipLimit,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      const cls = classifyFiles(arr);
      if (cls.reject) {
        toast({ title: '파일 거부됨', description: cls.reject, variant: 'destructive' });
        return;
      }
      onSelect({ mode: cls.mode, zipFile: cls.zipFile ?? null, mdFiles: cls.mdFiles ?? [] });
    },
    [onSelect],
  );

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase text-muted-foreground">1. 파일</Label>
        {(mode !== 'idle' || disabled) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onClear();
              setShowAll(false);
            }}
            disabled={disabled}
            className="h-7 text-xs"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            다시 선택
          </Button>
        )}
      </div>

      <div
        className={cn(
          'relative rounded-lg border-2 border-dashed bg-card p-6 text-center transition-colors',
          dragOver ? 'border-primary bg-accent' : 'border-border',
          disabled && 'pointer-events-none opacity-60',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        tabIndex={0}
        role="button"
        aria-label="파일 업로드 영역"
        onKeyDown={(e) => {
          if (disabled) return;
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
          accept=".zip,.md,.markdown,application/zip,text/markdown"
          multiple
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {mode === 'idle' ? (
          <div className="flex flex-col items-center gap-2">
            <UploadCloud className="h-7 w-7 text-muted-foreground" aria-hidden />
            <p className="text-sm">
              {dragOver
                ? '여기에 놓으면 파일이 추가됩니다'
                : 'zip 또는 .md 파일을 끌어다 놓으세요'}
            </p>
            <p className="text-xs text-muted-foreground">
              개별 .md 1MB · zip 50MB · 한 번에 최대 500개
            </p>
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
        ) : mode === 'zip' && zipFile ? (
          <div className="flex flex-col items-center gap-2 text-sm">
            <FileArchive className="h-7 w-7 text-amber-500" aria-hidden />
            <p className="font-medium">📦 {zipFile.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(zipFile.size)}</p>
          </div>
        ) : (
          <div className="space-y-2 text-left">
            <div className="flex items-center justify-center gap-2 text-sm">
              <FileText className="h-5 w-5 text-emerald-500" aria-hidden />
              <span className="font-medium">📄 {mdFiles.length}개 파일</span>
              <span className="text-xs text-muted-foreground">
                · 합계 {formatBytes(mdFiles.reduce((s, f) => s + f.size, 0))}
              </span>
            </div>
            <ul role="list" className="space-y-0.5">
              {(showAll ? mdFiles : mdFiles.slice(0, 5)).map((f, i) => (
                <li
                  role="listitem"
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between gap-2 rounded bg-muted/30 px-2 py-1 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <FileText
                      className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="truncate font-mono">{f.name}</span>
                  </span>
                  <span className="flex-shrink-0 tabular-nums text-muted-foreground">
                    {formatBytes(f.size)}
                  </span>
                </li>
              ))}
              {!showAll && mdFiles.length > 5 && (
                <li className="px-2 pt-1 text-xs text-muted-foreground">
                  외 {mdFiles.length - 5}개 …{' '}
                  <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={() => setShowAll(true)}
                  >
                    전체 보기
                  </button>
                </li>
              )}
              {showAll && mdFiles.length > 5 && (
                <li className="px-2 pt-1 text-xs text-muted-foreground">
                  <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={() => setShowAll(false)}
                  >
                    접기
                  </button>
                </li>
              )}
            </ul>
          </div>
        )}

        {(overFileLimit || overZipLimit) && (
          <p className="mt-3 flex items-center justify-center gap-1 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden />
            {overFileLimit
              ? `파일 수가 한도(${MAX_FILES_COUNT}개)를 초과합니다`
              : `zip 크기가 한도(${MAX_ZIP_BYTES / 1024 / 1024}MB)를 초과합니다`}
          </p>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// 옵션 카드
// =====================================================================

interface OptionsProps {
  targetNodeId: string;
  onTargetChange: (id: string) => void;
  conflictPolicy: ConflictPolicy;
  onConflictPolicyChange: (p: ConflictPolicy) => void;
  preserveFolders: boolean;
  onPreserveFoldersChange: (v: boolean) => void;
  defaultAuthor: string;
  onDefaultAuthorChange: (v: string) => void;
  defaultStatus: PageStatus;
  onDefaultStatusChange: (s: PageStatus) => void;
  mode: DropMode;
  disabled: boolean;
}

function ImportOptions({
  targetNodeId,
  onTargetChange,
  conflictPolicy,
  onConflictPolicyChange,
  preserveFolders,
  onPreserveFoldersChange,
  defaultAuthor,
  onDefaultAuthorChange,
  defaultStatus,
  onDefaultStatusChange,
  mode,
  disabled,
}: OptionsProps) {
  const [currentUser, setCurrentUser] = useState('현재 사용자');

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  const folderToggleDisabled = disabled || mode === 'files';

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase text-muted-foreground">2. 옵션</Label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 대상 워크스페이스 */}
        <div className="space-y-1.5">
          <Label htmlFor="ws-picker" className="text-sm">
            대상 워크스페이스
          </Label>
          <WorkspacePicker value={targetNodeId} onChange={onTargetChange} disabled={disabled} />
          <p className="text-[11px] text-muted-foreground">
            업로드된 파일이 이 폴더 하위에 등록됩니다. 비워두면 트리 루트.
          </p>
        </div>

        {/* 폴더 보존 */}
        <div className="space-y-1.5">
          <Label htmlFor="preserve-folders" className="text-sm">
            폴더 구조 보존
          </Label>
          <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-3">
            <Checkbox
              id="preserve-folders"
              checked={preserveFolders}
              onCheckedChange={(v) => onPreserveFoldersChange(v === true)}
              disabled={folderToggleDisabled}
              aria-describedby="preserve-folders-desc"
            />
            <Label htmlFor="preserve-folders" className="cursor-pointer text-sm">
              zip 내부 폴더를 폴더 노드로 재현
            </Label>
          </div>
          <p id="preserve-folders-desc" className="text-[11px] text-muted-foreground">
            {mode === 'files'
              ? '다중 파일 모드에서는 폴더 구조가 없으므로 적용되지 않습니다.'
              : 'zip 안의 디렉터리마다 폴더가 자동 생성됩니다.'}
          </p>
        </div>
      </div>

      {/* 충돌 정책 */}
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium">충돌 정책</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {POLICY_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              htmlFor={`cp-${opt.value}`}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors',
                'has-[input:checked]:border-primary has-[input:checked]:bg-accent',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <span className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  id={`cp-${opt.value}`}
                  name="conflict-policy"
                  className="h-4 w-4 cursor-pointer text-primary focus-visible:ring-2 focus-visible:ring-ring"
                  value={opt.value}
                  checked={conflictPolicy === opt.value}
                  onChange={() => onConflictPolicyChange(opt.value)}
                  disabled={disabled}
                  aria-describedby={`cp-${opt.value}-desc`}
                />
                <span
                  className={cn(
                    'font-medium',
                    opt.emphasized && 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {opt.label}
                </span>
              </span>
              <span id={`cp-${opt.value}-desc`} className="text-xs text-muted-foreground">
                {opt.description}
              </span>
            </label>
          ))}
        </div>

        {conflictPolicy === 'overwrite' && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <p>
              덮어쓰기는 기존 페이지의 새 버전을 만듭니다. 다른 사용자가 편집 중인 페이지는 자동으로
              스킵됩니다.
            </p>
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 기본 작성자 */}
        <div className="space-y-1.5">
          <Label htmlFor="default-author" className="text-sm">
            기본 작성자 <span className="text-muted-foreground">(선택)</span>
          </Label>
          <Input
            id="default-author"
            value={defaultAuthor}
            onChange={(e) => onDefaultAuthorChange(e.target.value)}
            placeholder={`비어 있으면 현재 사용자(${currentUser}) 가 사용됩니다`}
            className="h-9 text-sm"
            disabled={disabled}
            aria-describedby="default-author-desc"
          />
          <p id="default-author-desc" className="text-[11px] text-muted-foreground">
            frontmatter 의 author 키가 없는 파일에 적용됩니다.
          </p>
        </div>

        {/* 기본 상태 */}
        <div className="space-y-1.5">
          <Label htmlFor="default-status" className="text-sm">
            기본 상태 <span className="text-muted-foreground">(선택)</span>
          </Label>
          <Select
            value={defaultStatus}
            onValueChange={(v) => onDefaultStatusChange(v as PageStatus)}
            disabled={disabled}
          >
            <SelectTrigger id="default-status" className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_VALUES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            frontmatter 의 status 키가 없는 파일에 적용됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// 실행 바 + 진행
// =====================================================================

interface RunBarProps {
  summaryLine: string;
  canRun: boolean;
  phase: Phase;
  progress: number;
  currentLabel: string;
  fileCountClient: number;
  onRun: () => void;
  onReset: () => void;
  onCancel: () => void;
}

function ImportRunBar({
  summaryLine,
  canRun,
  phase,
  progress,
  currentLabel,
  fileCountClient,
  onRun,
  onReset,
  onCancel,
}: RunBarProps) {
  const isUploading = phase === 'uploading';
  const isProcessing = phase === 'processing';
  const isBusy = isUploading || isProcessing;

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs uppercase text-muted-foreground">3. 실행</Label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {summaryLine}
          {fileCountClient > 0 && (
            <span className="ml-1 text-[11px]">
              · 클라이언트 사전 검증 후 전송
            </span>
          )}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={isBusy}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            초기화
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onRun}
            disabled={!canRun || isBusy}
            title={!canRun && !isBusy ? '먼저 파일을 선택하세요' : undefined}
          >
            {isBusy ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <UploadIcon className="mr-1 h-4 w-4" aria-hidden />
            )}
            {isBusy ? '가져오는 중...' : '가져오기 시작'}
          </Button>
        </div>
      </div>

      {isBusy && (
        <div
          className="space-y-1.5 rounded-md border bg-muted/30 p-3"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between text-xs">
            <span>{isProcessing ? '서버에서 처리 중...' : currentLabel}</span>
            <span className="tabular-nums text-muted-foreground">
              {isProcessing ? '처리 중' : `${progress}%`}
            </span>
          </div>
          <ProgressBar percent={progress} indeterminate={isProcessing} />
          <div className="flex justify-end pt-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={isProcessing}
              className="h-6 text-xs"
            >
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressBar({ percent, indeterminate }: { percent: number; indeterminate?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          'h-full bg-primary transition-[width] duration-150',
          indeterminate && 'animate-pulse',
        )}
        style={{ width: indeterminate ? '100%' : `${percent}%` }}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-busy={indeterminate ? true : undefined}
      />
    </div>
  );
}

// =====================================================================
// 결과 패널
// =====================================================================

interface ResultPanelProps {
  result: ImportResultDto;
  filter: ImportAction | 'all';
  onFilterChange: (f: ImportAction | 'all') => void;
  onCopyJson: () => void;
  onDownloadCsv: () => void;
  onStartOver: () => void;
}

function ImportResultPanel({
  result,
  filter,
  onFilterChange,
  onCopyJson,
  onDownloadCsv,
  onStartOver,
}: ResultPanelProps) {
  const { summary, details, mode, targetNodeId } = result;

  const filtered = useMemo(() => {
    if (filter === 'all') return details;
    return details.filter((d) => d.action === filter);
  }, [details, filter]);

  const allFailed = details.length > 0 && summary.created === 0 && summary.failed === details.length;
  const allSkipped = details.length > 0 && summary.skipped === details.length;
  const showFilterBar = details.length > 100;

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs uppercase text-muted-foreground">4. 결과 리포트</Label>
        <p className="text-[11px] text-muted-foreground">
          모드: <strong className="text-foreground">{mode === 'zip' ? 'zip' : '다중 파일'}</strong>{' '}
          · 대상:{' '}
          <strong className="text-foreground">{targetNodeId ? targetNodeId : '루트'}</strong>{' '}
          · 처리 시각: {new Date().toLocaleString('ko-KR')}
        </p>
      </div>

      <SummaryStrip summary={summary} />

      {allFailed && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <p>모든 항목이 실패했습니다. 사유 컬럼을 확인해주세요.</p>
        </div>
      )}

      {!allFailed && allSkipped && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <p>
            모든 항목이 이미 존재하여 건너뛰었습니다. 충돌 정책을 &apos;덮어쓰기&apos; 또는
            &apos;리네임&apos;으로 변경해보세요.
          </p>
        </div>
      )}

      {showFilterBar && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Label className="text-xs">필터:</Label>
          <FilterChip
            active={filter === 'all'}
            label={`전체 (${details.length})`}
            onClick={() => onFilterChange('all')}
          />
          {summary.created > 0 && (
            <FilterChip
              active={filter === 'created'}
              label={`생성 (${summary.created})`}
              onClick={() => onFilterChange('created')}
            />
          )}
          {countByAction(details, 'overwritten') > 0 && (
            <FilterChip
              active={filter === 'overwritten'}
              label={`덮어씀 (${countByAction(details, 'overwritten')})`}
              onClick={() => onFilterChange('overwritten')}
            />
          )}
          {countByAction(details, 'renamed') > 0 && (
            <FilterChip
              active={filter === 'renamed'}
              label={`리네임 (${countByAction(details, 'renamed')})`}
              onClick={() => onFilterChange('renamed')}
            />
          )}
          {summary.skipped > 0 && (
            <FilterChip
              active={filter === 'skipped'}
              label={`스킵 (${summary.skipped})`}
              onClick={() => onFilterChange('skipped')}
            />
          )}
          {summary.failed > 0 && (
            <FilterChip
              active={filter === 'failed'}
              label={`실패 (${summary.failed})`}
              onClick={() => onFilterChange('failed')}
            />
          )}
        </div>
      )}

      {details.length === 0 ? (
        <p className="rounded-md border bg-muted/30 py-8 text-center text-sm text-muted-foreground">
          처리된 항목이 없습니다.
        </p>
      ) : (
        <ScrollArea className="h-[480px] rounded-md border">
          <table className="w-full text-sm">
            <caption className="sr-only">가져오기 결과 상세</caption>
            <thead className="sticky top-0 bg-muted/80 text-xs uppercase backdrop-blur">
              <tr>
                <th className="px-3 py-2 text-left">경로</th>
                <th className="w-28 px-3 py-2 text-left">액션</th>
                <th className="w-48 px-3 py-2 text-left">제목</th>
                <th className="w-32 px-3 py-2 text-left">태그</th>
                <th className="px-3 py-2 text-left">사유</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((d, i) => (
                <ResultRow key={`${d.path}-${i}`} detail={d} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    필터 결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          감사 로그에 기록되었습니다.{' '}
          <Link href="/admin" className="underline hover:text-foreground">
            감사 로그 탭
          </Link>{' '}
          에서 확인할 수 있습니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCopyJson}>
            <Copy className="mr-1 h-3.5 w-3.5" aria-hidden />
            JSON 복사
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onDownloadCsv}>
            <DownloadIcon className="mr-1 h-3.5 w-3.5" aria-hidden />
            CSV 다운로드
          </Button>
          <Button type="button" size="sm" onClick={onStartOver}>
            <RefreshCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
            새로 가져오기
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      size="sm"
      className="h-7 text-xs"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function countByAction(details: ImportDetail[], action: ImportAction): number {
  return details.reduce((s, d) => s + (d.action === action ? 1 : 0), 0);
}

// ----- SummaryStrip ------------------------------------------------

function SummaryStrip({ summary }: { summary: ImportSummary }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <SummaryCard
        icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
        label="생성"
        value={summary.created}
        accent="bg-emerald-50/60 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
      />
      <SummaryCard
        icon={<MinusCircle className="h-5 w-5" aria-hidden />}
        label="스킵"
        value={summary.skipped}
        accent="text-muted-foreground"
      />
      <SummaryCard
        icon={<AlertCircle className="h-5 w-5" aria-hidden />}
        label="실패"
        value={summary.failed}
        accent={
          summary.failed > 0
            ? 'bg-destructive/5 text-destructive border-destructive/30'
            : 'text-muted-foreground'
        }
      />
      <SummaryCard
        icon={<FolderPlus className="h-5 w-5" aria-hidden />}
        label="폴더 자동 생성"
        value={summary.foldersCreated}
        accent="text-blue-700 dark:text-blue-400"
      />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-md border p-3', accent)}>
      <span className="flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ----- 결과 행 ----------------------------------------------------

const ACTION_LABEL: Record<ImportAction, string> = {
  created: '생성',
  overwritten: '덮어씀',
  renamed: '리네임',
  skipped: '스킵',
  failed: '실패',
};

const ACTION_BORDER: Record<ImportAction, string> = {
  created: 'border-l-emerald-500',
  overwritten: 'border-l-blue-500',
  renamed: 'border-l-amber-500',
  skipped: 'border-l-muted-foreground/40',
  failed: 'border-l-destructive',
};

const ACTION_BADGE_VARIANT: Record<ImportAction, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  created: 'default',
  overwritten: 'secondary',
  renamed: 'outline',
  skipped: 'outline',
  failed: 'destructive',
};

function ResultRow({ detail }: { detail: ImportDetail }) {
  const tags = detail.tagsApplied ?? [];
  const remaining = tags.length - 2;
  const isFailed = detail.action === 'failed';
  const isSkipped = detail.action === 'skipped';

  return (
    <tr
      className={cn(
        'border-l-4 hover:bg-muted/30',
        ACTION_BORDER[detail.action],
        isFailed && 'text-destructive',
        isSkipped && 'text-muted-foreground',
      )}
    >
      <td className="px-3 py-2">
        <span className="block max-w-[24rem] truncate font-mono text-xs" title={detail.path}>
          {detail.path}
        </span>
      </td>
      <td className="px-3 py-2">
        <Badge variant={ACTION_BADGE_VARIANT[detail.action]}>{ACTION_LABEL[detail.action]}</Badge>
      </td>
      <td className="px-3 py-2">
        <span className="block truncate" title={detail.title}>
          {detail.title ?? '—'}
        </span>
      </td>
      <td className="px-3 py-2">
        {tags.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {tags.slice(0, 2).map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">
                #{t}
              </Badge>
            ))}
            {remaining > 0 && (
              <span className="text-xs text-muted-foreground">+{remaining}</span>
            )}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        {detail.reason ?? <span className="text-muted-foreground">—</span>}
      </td>
    </tr>
  );
}

