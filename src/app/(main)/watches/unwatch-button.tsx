'use client';

import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

interface Props {
  pageId?: string;
  treeNodeId?: string;
  label: string;
}

export function UnwatchButton({ pageId, treeNodeId, label }: Props) {
  const router = useRouter();
  const onClick = async () => {
    if (!window.confirm(`"${label}" 구독을 해제할까요?`)) return;
    const qs = pageId
      ? `pageId=${encodeURIComponent(pageId)}`
      : treeNodeId
        ? `treeNodeId=${encodeURIComponent(treeNodeId)}`
        : '';
    if (!qs) return;
    const res = await fetch(`/api/watch?${qs}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ title: '구독 해제' });
      router.refresh();
    } else {
      toast({ title: '해제 실패', variant: 'destructive' });
    }
  };
  return (
    <Button variant="ghost" size="sm" onClick={onClick} title="구독 해제">
      <Trash2 className="h-4 w-4 text-muted-foreground" />
    </Button>
  );
}
