'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: '전역',
    items: [
      { keys: ['Ctrl', 'K'], description: '검색 포커스' },
      { keys: ['Ctrl', '/'], description: '단축키 도움말 (이 창)' },
      { keys: ['Ctrl', 'B'], description: '사이드바 접기/펼치기' },
    ],
  },
  {
    title: '에디터',
    items: [
      { keys: ['Ctrl', 'S'], description: '저장' },
      { keys: ['Ctrl', 'B'], description: '굵게' },
      { keys: ['Ctrl', 'I'], description: '기울임' },
      { keys: ['Ctrl', 'Z'], description: '실행 취소' },
      { keys: ['Ctrl', 'Y'], description: '다시 실행' },
      { keys: ['/'], description: '슬래시 명령어 메뉴 열기' },
      { keys: ['#'], description: '제목 1 (마크다운 입력)' },
      { keys: ['##'], description: '제목 2' },
      { keys: ['-', 'Space'], description: '목록' },
      { keys: ['1.', 'Space'], description: '번호 매기기' },
      { keys: ['>', 'Space'], description: '인용' },
      { keys: ['```'], description: '코드 블록' },
    ],
  },
  {
    title: '트리 / 페이지',
    items: [
      { keys: ['우클릭'], description: '트리 노드 컨텍스트 메뉴' },
      { keys: ['드래그'], description: '트리 노드 이동 / 칸반 카드 이동' },
    ],
  },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>단축키 (NFR-404)</DialogTitle>
          <DialogDescription>주요 단축키와 입력 팁</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="mb-2 text-sm font-semibold">{g.title}</h3>
              <div className="space-y-1.5">
                {g.items.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span>{s.description}</span>
                    <span className="flex items-center gap-1">
                      {s.keys.map((k, j) => (
                        <kbd
                          key={j}
                          className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
