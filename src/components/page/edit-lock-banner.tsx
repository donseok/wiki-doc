'use client';
import { useEffect, useState } from 'react';
import { Lock, AlertTriangle, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

interface Props {
  pageId: string;
  /** 표시 모드: 'view' = 뷰어에서 표시, 'edit' = 에디터에서 표시 */
  mode: 'view' | 'edit';
}

interface LockInfo {
  locked: boolean;
  editor?: string;
  expiresAt?: string;
  isMine?: boolean;
}

/**
 * FR-215/216 — 편집 잠금 배너 (읽기 전용 컴포넌트)
 * - 뷰어 모드: "○○○ 님이 편집 중" 안내 + 강제 해제 버튼
 * - 에디터 모드: 본인이 잠금 보유 중이면 만료까지 남은 시간 표시
 */
export function EditLockBanner({ pageId, mode }: Props) {
  const [info, setInfo] = useState<LockInfo>({ locked: false });

  useEffect(() => {
    let stop = false;
    const refresh = async () => {
      const res = await fetch(`/api/pages/${pageId}/lock`, { cache: 'no-store' });
      const json = await res.json();
      if (!stop && json.ok) setInfo(json.data);
    };
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [pageId]);

  if (!info.locked) return null;

  const expiresIn = info.expiresAt
    ? Math.max(0, Math.round((new Date(info.expiresAt).getTime() - Date.now()) / 1000))
    : 0;

  if (mode === 'view' && !info.isMine) {
    const onForceRelease = async () => {
      if (!window.confirm(`${info.editor}님의 편집 잠금을 강제 해제하시겠습니까? 원래 보유자에게 알림이 발송됩니다.`))
        return;
      const res = await fetch(`/api/pages/${pageId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'force-release' }),
      });
      if (res.ok) {
        toast({ title: '잠금 강제 해제 완료' });
        setInfo({ locked: false });
      } else {
        toast({ title: '강제 해제 실패', variant: 'destructive' });
      }
    };

    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
        <Lock className="h-4 w-4" />
        <span>
          <strong>{info.editor}</strong> 님이 편집 중입니다 (만료 {expiresIn}s)
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7"
          onClick={onForceRelease}
          title="FR-216 강제 해제"
        >
          <Unlock className="mr-1 h-3.5 w-3.5" />
          강제 해제
        </Button>
      </div>
    );
  }

  if (mode === 'edit' && info.isMine) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200">
        <Lock className="h-3.5 w-3.5" />
        <span>편집 잠금 활성 — 만료까지 {Math.floor(expiresIn / 60)}분 {expiresIn % 60}초</span>
      </div>
    );
  }

  if (mode === 'edit' && !info.isMine) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4" />
        <strong>{info.editor}</strong> 님이 편집 중 — 저장 시 충돌 발생
      </div>
    );
  }

  return null;
}
