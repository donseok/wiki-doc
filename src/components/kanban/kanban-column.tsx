'use client';

import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  column: string;
  label: string;
  count: number;
  onAdd: () => void;
  children: React.ReactNode;
}

export function KanbanColumnView({ column, label, count, onAdd, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex h-full flex-col rounded-lg border bg-card transition-colors',
        isOver && 'border-primary bg-accent/40',
      )}
    >
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{label}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {count}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onAdd} title="카드 추가">
          <Plus className="h-4 w-4" />
        </Button>
      </header>
      <div className="flex-1 space-y-2 p-2">{children}</div>
    </section>
  );
}
