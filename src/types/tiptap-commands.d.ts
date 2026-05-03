import '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    piWikiEditorCommands: {
      undo: () => ReturnType;
      redo: () => ReturnType;
      toggleHeading: (attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 }) => ReturnType;
      toggleBold: () => ReturnType;
      toggleItalic: () => ReturnType;
      toggleStrike: () => ReturnType;
      toggleHighlight: (attrs?: Record<string, unknown>) => ReturnType;
      toggleCode: () => ReturnType;
      toggleBulletList: () => ReturnType;
      toggleOrderedList: () => ReturnType;
      toggleTaskList: () => ReturnType;
      toggleBlockquote: () => ReturnType;
      toggleCodeBlock: () => ReturnType;
      setHorizontalRule: () => ReturnType;
      unsetLink: () => ReturnType;
      setLink: (attrs: {
        href: string;
        target?: string | null;
        rel?: string | null;
        class?: string | null;
      }) => ReturnType;
      insertTable: (options?: {
        rows?: number;
        cols?: number;
        withHeaderRow?: boolean;
      }) => ReturnType;
      setImage: (attrs: { src: string; alt?: string; title?: string }) => ReturnType;
    };
  }
}
