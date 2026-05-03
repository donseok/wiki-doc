'use client';
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code2,
  Minus,
  Table as TableIcon,
  Image as ImageIcon,
  Layers,
  CheckSquare,
} from 'lucide-react';

interface SlashCommand {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  keywords: string;
  run: (editor: Editor) => void;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    key: 'h1',
    label: '제목 1',
    description: '큰 섹션 제목',
    icon: <Heading1 className="h-4 w-4" />,
    keywords: 'h1 heading 제목',
    run: (e) => e.chain().focus().deleteRange({ from: getSlashFrom(e), to: e.state.selection.to }).toggleHeading({ level: 1 }).run(),
  },
  {
    key: 'h2',
    label: '제목 2',
    description: '중간 섹션 제목',
    icon: <Heading2 className="h-4 w-4" />,
    keywords: 'h2 heading 제목',
    run: (e) => e.chain().focus().deleteRange({ from: getSlashFrom(e), to: e.state.selection.to }).toggleHeading({ level: 2 }).run(),
  },
  {
    key: 'h3',
    label: '제목 3',
    description: '소제목',
    icon: <Heading3 className="h-4 w-4" />,
    keywords: 'h3 heading 제목',
    run: (e) => e.chain().focus().deleteRange({ from: getSlashFrom(e), to: e.state.selection.to }).toggleHeading({ level: 3 }).run(),
  },
  {
    key: 'bullet',
    label: '목록',
    description: '점 글머리 목록',
    icon: <List className="h-4 w-4" />,
    keywords: 'bullet list ul 목록',
    run: (e) => e.chain().focus().deleteRange({ from: getSlashFrom(e), to: e.state.selection.to }).toggleBulletList().run(),
  },
  {
    key: 'ordered',
    label: '번호 매기기',
    description: '번호 매겨진 목록',
    icon: <ListOrdered className="h-4 w-4" />,
    keywords: 'ordered list ol 번호',
    run: (e) => e.chain().focus().deleteRange({ from: getSlashFrom(e), to: e.state.selection.to }).toggleOrderedList().run(),
  },
  {
    key: 'task',
    label: '체크박스',
    description: 'Action Items 자동 추출 대상',
    icon: <ListChecks className="h-4 w-4" />,
    keywords: 'task todo checkbox 체크 할일 action',
    run: (e) => e.chain().focus().deleteRange({ from: getSlashFrom(e), to: e.state.selection.to }).toggleTaskList().run(),
  },
  {
    key: 'quote',
    label: '인용',
    description: '인용 블록',
    icon: <Quote className="h-4 w-4" />,
    keywords: 'quote blockquote 인용',
    run: (e) => e.chain().focus().deleteRange({ from: getSlashFrom(e), to: e.state.selection.to }).toggleBlockquote().run(),
  },
  {
    key: 'code',
    label: '코드 블록',
    description: '문법 강조 코드 블록',
    icon: <Code2 className="h-4 w-4" />,
    keywords: 'code 코드',
    run: (e) => e.chain().focus().deleteRange({ from: getSlashFrom(e), to: e.state.selection.to }).toggleCodeBlock().run(),
  },
  {
    key: 'mermaid',
    label: 'Mermaid 다이어그램',
    description: 'flowchart / sequence / ER',
    icon: <Layers className="h-4 w-4" />,
    keywords: 'mermaid diagram flowchart sequence 다이어그램',
    run: (e) => {
      e.chain()
        .focus()
        .deleteRange({ from: getSlashFrom(e), to: e.state.selection.to })
        .insertContent({
          type: 'codeBlock',
          attrs: { language: 'mermaid' },
          content: [{ type: 'text', text: 'flowchart LR\n  A[Start] --> B[End]' }],
        })
        .run();
    },
  },
  {
    key: 'divider',
    label: '구분선',
    description: '수평선',
    icon: <Minus className="h-4 w-4" />,
    keywords: 'divider hr 구분선',
    run: (e) => e.chain().focus().deleteRange({ from: getSlashFrom(e), to: e.state.selection.to }).setHorizontalRule().run(),
  },
  {
    key: 'table',
    label: '표',
    description: '3x3 표 삽입',
    icon: <TableIcon className="h-4 w-4" />,
    keywords: 'table 표',
    run: (e) =>
      e
        .chain()
        .focus()
        .deleteRange({ from: getSlashFrom(e), to: e.state.selection.to })
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    key: 'decision',
    label: 'Decision 블록',
    description: '의사결정 양식 (FR-507/508)',
    icon: <CheckSquare className="h-4 w-4" />,
    keywords: 'decision adr 의사결정',
    run: (e) =>
      e
        .chain()
        .focus()
        .deleteRange({ from: getSlashFrom(e), to: e.state.selection.to })
        .insertDecisionBlock({ title: '의사결정 제목', status: 'Proposed' })
        .run(),
  },
  {
    key: 'image',
    label: '이미지 업로드',
    description: '파일을 선택해 본문에 삽입',
    icon: <ImageIcon className="h-4 w-4" />,
    keywords: 'image picture 이미지',
    run: () => {
      // 호출자가 별도로 처리 — slash menu 컴포넌트가 이미지 업로더 트리거
    },
  },
];

function getSlashFrom(editor: Editor): number {
  const { from } = editor.state.selection;
  const node = editor.state.doc.textBetween(Math.max(0, from - 30), from, '\n');
  const idx = node.lastIndexOf('/');
  if (idx === -1) return from;
  return from - (node.length - idx);
}

interface Props {
  editor: Editor;
  open: boolean;
  query: string;
  position: { top: number; left: number };
  onClose: () => void;
  onPickImage: () => void;
}

export function SlashMenu({ editor, open, query, position, onClose, onPickImage }: Props) {
  const [active, setActive] = useState(0);
  const filtered = SLASH_COMMANDS.filter((c) =>
    `${c.label} ${c.keywords}`.toLowerCase().includes(query.toLowerCase()),
  );
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[active];
        if (cmd) {
          if (cmd.key === 'image') onPickImage();
          else cmd.run(editor);
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, filtered, active, editor, onClose, onPickImage]);

  if (!open || filtered.length === 0) return null;

  return (
    <div
      className="absolute z-50 max-h-[300px] w-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-lg"
      style={{ top: position.top, left: position.left }}
    >
      {filtered.map((c, i) => (
        <button
          key={c.key}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${
            i === active ? 'bg-accent' : ''
          }`}
          onMouseEnter={() => setActive(i)}
          onClick={() => {
            if (c.key === 'image') onPickImage();
            else c.run(editor);
            onClose();
          }}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded border bg-background">
            {c.icon}
          </span>
          <span className="flex flex-col">
            <span className="font-medium">{c.label}</span>
            <span className="text-xs text-muted-foreground">{c.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
