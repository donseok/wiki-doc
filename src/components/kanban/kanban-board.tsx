'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  closestCorners,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { KANBAN_COLUMNS, COLUMN_LABEL, type KanbanCardData } from '@/lib/kanban';
import { KanbanColumnView } from './kanban-column';
import { KanbanCardView } from './kanban-card';
import { CardCreateDialog } from './card-create-dialog';
import { CardDetailDialog } from './card-detail-dialog';

interface Props {
  boardId: string;
  initialCards: KanbanCardData[];
}

export function KanbanBoard({ boardId, initialCards }: Props) {
  const [cards, setCards] = useState<KanbanCardData[]>(initialCards);
  const [filter, setFilter] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState<{ open: boolean; column: string }>({
    open: false,
    column: 'Idea',
  });
  const [detail, setDetail] = useState<KanbanCardData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const grouped = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const visible = term
      ? cards.filter((c) => `${c.title} ${c.body ?? ''}`.toLowerCase().includes(term))
      : cards;
    const map: Record<string, KanbanCardData[]> = {};
    for (const col of KANBAN_COLUMNS) map[col] = [];
    for (const c of visible) {
      if (!map[c.column]) map[c.column] = [];
      map[c.column].push(c);
    }
    for (const col of Object.keys(map)) {
      map[col].sort((a, b) => a.order - b.order);
    }
    return map;
  }, [cards, filter]);

  const activeCard = useMemo(
    () => (activeId ? cards.find((c) => c.id === activeId) : null),
    [activeId, cards],
  );

  const refresh = async () => {
    const res = await fetch(`/api/boards/${boardId}/cards`, { cache: 'no-store' });
    const json = await res.json();
    if (json.ok) setCards(json.data);
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // over 가 컬럼 ID 인 경우 (빈 컬럼 위)
    const isColumn = (KANBAN_COLUMNS as readonly string[]).includes(overIdStr);
    const activeCard = cards.find((c) => c.id === activeIdStr);
    if (!activeCard) return;

    let targetColumn = activeCard.column;
    let targetIndex = -1;

    if (isColumn) {
      targetColumn = overIdStr;
      targetIndex = grouped[targetColumn]?.length ?? 0;
    } else {
      const overCard = cards.find((c) => c.id === overIdStr);
      if (!overCard) return;
      targetColumn = overCard.column;
      targetIndex = grouped[targetColumn].findIndex((c) => c.id === overCard.id);
    }

    // optimistic update
    const next = cards.filter((c) => c.id !== activeIdStr);
    const colCards = next.filter((c) => c.column === targetColumn).sort((a, b) => a.order - b.order);
    colCards.splice(targetIndex, 0, { ...activeCard, column: targetColumn });
    const repaired = colCards.map((c, i) => ({ ...c, order: i }));
    const otherCols = next.filter((c) => c.column !== targetColumn);
    setCards([...otherCols, ...repaired]);

    // 서버 동기화
    try {
      const res = await fetch(`/api/cards/${activeIdStr}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: targetColumn, order: targetIndex }),
      });
      if (!res.ok) throw new Error('서버 동기화 실패');
      // 정확한 order 재계산이 필요하면 refresh
      await refresh();
    } catch (err) {
      toast({
        title: '카드 이동 실패',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      await refresh();
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="카드 검색"
            className="h-8 w-[260px] pl-8"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          전체 {cards.length}개 · 표시 {Object.values(grouped).flat().length}개
        </span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {KANBAN_COLUMNS.map((col) => {
            const colCards = grouped[col] ?? [];
            return (
              <KanbanColumnView
                key={col}
                column={col}
                label={COLUMN_LABEL[col]}
                count={colCards.length}
                onAdd={() => setCreateOpen({ open: true, column: col })}
              >
                <SortableContext
                  items={colCards.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {colCards.length === 0 ? (
                    <p className="px-2 py-3 text-center text-xs text-muted-foreground">비어 있음</p>
                  ) : (
                    colCards.map((c) => (
                      <KanbanCardView key={c.id} card={c} onClick={() => setDetail(c)} />
                    ))
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground"
                    onClick={() => setCreateOpen({ open: true, column: col })}
                  >
                    <Plus className="h-3.5 w-3.5" /> 카드 추가
                  </Button>
                </SortableContext>
              </KanbanColumnView>
            );
          })}
        </div>

        <DragOverlay>
          {activeCard ? <KanbanCardView card={activeCard} onClick={() => undefined} dragOverlay /> : null}
        </DragOverlay>
      </DndContext>

      <CardCreateDialog
        boardId={boardId}
        column={createOpen.column}
        open={createOpen.open}
        onOpenChange={(o) => setCreateOpen((s) => ({ ...s, open: o }))}
        onCreated={() => {
          void refresh();
        }}
      />

      <CardDetailDialog
        card={detail}
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        onChanged={() => {
          void refresh();
          setDetail(null);
        }}
      />
    </>
  );
}
