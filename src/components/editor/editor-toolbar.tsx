'use client';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Minus,
  Undo,
  Redo,
  Link as LinkIcon,
  Highlighter,
  Image as ImageIcon,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Props {
  editor: Editor | null;
  onUploadImage: () => void;
}

export function EditorToolbar({ editor, onUploadImage }: Props) {
  if (!editor) return null;

  const Btn = ({
    onClick,
    active,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent',
            active && 'bg-accent text-foreground',
          )}
          aria-label={title}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );

  const Sep = () => <div className="mx-0.5 h-5 w-px bg-border" />;

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-md border bg-card p-1">
      <Btn onClick={() => editor.chain().focus().undo().run()} title="실행 취소 (Ctrl+Z)">
        <Undo className="h-4 w-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().redo().run()} title="다시 실행 (Ctrl+Y)">
        <Redo className="h-4 w-4" />
      </Btn>
      <Sep />

      <Btn
        active={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="제목 1"
      >
        <Heading1 className="h-4 w-4" />
      </Btn>
      <Btn
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="제목 2"
      >
        <Heading2 className="h-4 w-4" />
      </Btn>
      <Btn
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="제목 3"
      >
        <Heading3 className="h-4 w-4" />
      </Btn>
      <Sep />

      <Btn
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="굵게 (Ctrl+B)"
      >
        <Bold className="h-4 w-4" />
      </Btn>
      <Btn
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="기울임 (Ctrl+I)"
      >
        <Italic className="h-4 w-4" />
      </Btn>
      <Btn
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="취소선"
      >
        <Strikethrough className="h-4 w-4" />
      </Btn>
      <Btn
        active={editor.isActive('highlight')}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        title="형광펜"
      >
        <Highlighter className="h-4 w-4" />
      </Btn>
      <Btn
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="인라인 코드"
      >
        <Code className="h-4 w-4" />
      </Btn>
      <Sep />

      <Btn
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="목록"
      >
        <List className="h-4 w-4" />
      </Btn>
      <Btn
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="번호 매기기"
      >
        <ListOrdered className="h-4 w-4" />
      </Btn>
      <Btn
        active={editor.isActive('taskList')}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        title="체크박스 (Action Items)"
      >
        <ListChecks className="h-4 w-4" />
      </Btn>
      <Btn
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="인용"
      >
        <Quote className="h-4 w-4" />
      </Btn>
      <Btn
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="구분선"
      >
        <Minus className="h-4 w-4" />
      </Btn>
      <Sep />

      <Btn
        active={editor.isActive('link')}
        onClick={() => {
          const prev = editor.getAttributes('link').href as string | undefined;
          const url = window.prompt('링크 URL', prev || 'https://');
          if (url === null) return;
          if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
          } else {
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }
        }}
        title="링크"
      >
        <LinkIcon className="h-4 w-4" />
      </Btn>
      <Btn onClick={onUploadImage} title="이미지 업로드">
        <ImageIcon className="h-4 w-4" />
      </Btn>
    </div>
  );
}
