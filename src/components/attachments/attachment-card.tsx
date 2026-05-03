'use client';

/**
 * 첨부 파일 카드 — FR-1105
 *
 * - 파일명, 아이콘, 크기, 업로더, 업로드일시 표시
 * - 클릭 동작 (FR-1102 / FR-1106 / FR-1107):
 *     image → Lightbox
 *     pdf   → PdfPreviewDialog
 *     excel → ExcelPreviewDialog
 *     그 외 → 다운로드
 * - 우측 ⋮ 메뉴: 다운로드 / 삭제
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  FileType2,
  File as FileIcon,
  Presentation,
  Download,
  MoreVertical,
  Trash2,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatBytes, cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import type { AttachmentDTO } from '@/components/attachments/upload-dropzone';
import { Lightbox } from '@/components/attachments/lightbox';

// PDF/Excel 미리보기는 동적 로드 (초기 번들 영향 최소화)
const PdfPreviewDialog = dynamic(
  () => import('./pdf-preview-dialog').then((m) => m.PdfPreviewDialog),
  { ssr: false },
);
const ExcelPreviewDialog = dynamic(
  () => import('./excel-preview-dialog').then((m) => m.ExcelPreviewDialog),
  { ssr: false },
);

interface Props {
  attachment: AttachmentDTO;
  /** 삭제 후 콜백 (목록 갱신용) */
  onDeleted?: (id: string) => void;
  className?: string;
  /** 카드 컴팩트 표시 (사이드 패널 등) */
  compact?: boolean;
}

const ICON_MAP: Record<AttachmentDTO['fileType'], React.ComponentType<{ className?: string }>> = {
  image: FileImage,
  pdf: FileText,
  excel: FileSpreadsheet,
  word: FileType2,
  ppt: Presentation,
  zip: FileArchive,
  text: FileText,
  other: FileIcon,
};

const ICON_COLOR: Record<AttachmentDTO['fileType'], string> = {
  image: 'text-violet-500',
  pdf: 'text-red-500',
  excel: 'text-emerald-600',
  word: 'text-blue-500',
  ppt: 'text-orange-500',
  zip: 'text-amber-600',
  text: 'text-slate-500',
  other: 'text-muted-foreground',
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

export function AttachmentCard({ attachment, onDeleted, className, compact = false }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const Icon = ICON_MAP[attachment.fileType] ?? FileIcon;
  const iconColor = ICON_COLOR[attachment.fileType] ?? 'text-muted-foreground';
  const downloadUrl = `/api/attachments/${attachment.id}`;
  const inlineUrl = `/api/attachments/${attachment.id}?disposition=inline`;

  const handleClick = () => {
    if (attachment.fileType === 'image') {
      setLightboxOpen(true);
    } else if (attachment.fileType === 'pdf') {
      setPdfOpen(true);
    } else if (attachment.fileType === 'excel') {
      setExcelOpen(true);
    } else {
      // 다운로드 트리거
      window.location.href = downloadUrl;
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`"${attachment.filename}" 첨부를 삭제할까요?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/attachments/${attachment.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || '삭제 실패');
      toast({ title: '삭제 완료', description: attachment.filename });
      onDeleted?.(attachment.id);
    } catch (e) {
      toast({
        title: '삭제 실패',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          'group relative flex items-center gap-3 rounded-lg border bg-card px-3 py-2 transition-colors hover:border-primary/50 hover:bg-accent/40',
          compact ? 'py-2' : 'py-3',
          className,
        )}
      >
        <button
          type="button"
          onClick={handleClick}
          className="flex flex-1 items-center gap-3 text-left outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${attachment.filename} 열기`}
        >
          <div
            className={cn(
              'flex shrink-0 items-center justify-center rounded-md bg-muted',
              compact ? 'h-9 w-9' : 'h-10 w-10',
            )}
          >
            <Icon className={cn('h-5 w-5', iconColor)} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                'truncate font-medium text-foreground',
                compact ? 'text-xs' : 'text-sm',
              )}
              title={attachment.filename}
            >
              {attachment.filename}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              <span>{formatBytes(attachment.size)}</span>
              <span aria-hidden>·</span>
              <span>{formatDate(attachment.createdAt)}</span>
              {attachment.uploaderName && (
                <>
                  <span aria-hidden>·</span>
                  <span>@{attachment.uploaderName}</span>
                </>
              )}
            </div>
          </div>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="첨부 파일 메뉴"
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreVertical className="h-4 w-4" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem asChild>
              <a href={downloadUrl} download={attachment.filename}>
                <Download className="h-3.5 w-3.5" />
                다운로드
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {attachment.fileType === 'image' && (
        <Lightbox
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
          images={[
            {
              src: inlineUrl,
              alt: attachment.filename,
              filename: attachment.filename,
              downloadUrl,
            },
          ]}
        />
      )}
      {attachment.fileType === 'pdf' && pdfOpen && (
        <PdfPreviewDialog
          open={pdfOpen}
          onOpenChange={setPdfOpen}
          url={inlineUrl}
          filename={attachment.filename}
        />
      )}
      {attachment.fileType === 'excel' && excelOpen && (
        <ExcelPreviewDialog
          open={excelOpen}
          onOpenChange={setExcelOpen}
          url={downloadUrl}
          filename={attachment.filename}
        />
      )}
    </>
  );
}
