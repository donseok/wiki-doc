'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { colorByKey, type KanbanCardData } from '@/lib/kanban';

interface Props {
  card: KanbanCardData;
  onClick: () => void;
  dragOverlay?: boolean;
}

export function KanbanCardView({ card, onClick, dragOverlay }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const color = colorByKey(card.color);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group rounded-md border p-2 text-sm shadow-sm transition-shadow',
        color.bg,
        color.border,
        color.fg,
        isDragging && !dragOverlay && 'opacity-30',
        dragOverlay && 'shadow-xl ring-2 ring-primary',
      )}
      {...attributes}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          className="mt-0.5 cursor-grab text-muted-foreground opacity-40 hover:opacity-80 active:cursor-grabbing"
          aria-label="이동"
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" onClick={onClick} className="flex-1 text-left">
          <div className="font-medium leading-snug">{card.title}</div>
          {card.body && (
            <p className="mt-1 line-clamp-2 text-xs opacity-80">{card.body}</p>
          )}
          <div className="mt-1.5 flex items-center gap-2 text-[10px] opacity-70">
            <span>@{card.authorName}</span>
            {card.linkedPageId && (
              <span className="inline-flex items-center gap-0.5">
                <Link2 className="h-3 w-3" /> 연결됨
              </span>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
