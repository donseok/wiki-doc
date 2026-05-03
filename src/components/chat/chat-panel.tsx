'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FormEvent, KeyboardEvent, useRef, useState } from 'react';
import {
  Bot,
  ExternalLink,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface ChatSource {
  pageId: string;
  title: string;
  heading?: string | null;
  snippet: string;
  url: string;
  matchType: 'current' | 'vector' | 'title' | 'body' | 'tag' | 'attachment';
  score?: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
}

interface ChatResponse {
  ok: boolean;
  data?: {
    answer: string;
    model: string | null;
    sources: ChatSource[];
  };
  error?: string;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '위키 문서를 기준으로 답변합니다. 현재 문서나 전체 위키에 대해 질문해 주세요.',
};

export function ChatPanel() {
  const pathname = usePathname();
  const currentPageId = extractPageId(pathname);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);

  const submit = async (event?: FormEvent, override?: string) => {
    event?.preventDefault();
    const message = (override ?? input).trim();
    if (!message || loading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
    };
    const history = messages
      .filter((item) => item.id !== WELCOME_MESSAGE.id)
      .map(({ role, content }) => ({ role, content }));

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          pageId: currentPageId,
          history,
        }),
      });
      const json = (await res.json().catch(() => null)) as ChatResponse | null;
      if (!res.ok || !json?.ok || !json.data) {
        throw new Error(json?.error || '챗봇 응답 생성에 실패했습니다.');
      }
      const data = json.data;

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.answer,
          sources: data.sources,
        },
      ]);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 0);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: err instanceof Error ? err.message : '챗봇 응답 생성에 실패했습니다.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void submit();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {open && (
        <section className="flex h-[min(680px,calc(100vh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">Atlas 챗봇</h2>
              <p className="truncate text-xs text-muted-foreground">
                {currentPageId ? '현재 문서 우선 검색' : '전체 위키 검색'}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                위키 문서를 검색하고 답변을 생성하는 중입니다.
              </div>
            )}
          </div>

          <div className="border-t p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {(currentPageId
                ? ['현재 문서 요약해줘', '현재 문서의 미해결 사항을 알려줘']
                : ['Pending 항목을 찾아줘', '최근 논의된 Decision을 요약해줘']
              ).map((label) => (
                <button
                  key={label}
                  type="button"
                  disabled={loading}
                  onClick={() => void submit(undefined, label)}
                  className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={(event) => void submit(event)} className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="위키에 대해 질문하세요. Shift+Enter로 줄바꿈"
                className="max-h-32 min-h-[44px] resize-none text-sm"
                disabled={loading}
              />
              <Button type="submit" size="icon" disabled={loading || !input.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </section>
      )}

      <Button
        type="button"
        size="lg"
        onClick={() => setOpen((value) => !value)}
        className="h-12 rounded-full px-4 shadow-lg"
      >
        <MessageCircle className="h-5 w-5" />
        챗봇
      </Button>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-2', isUser && 'justify-end')}>
      {!isUser && (
        <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary">
          <Bot className="h-3.5 w-3.5" />
        </div>
      )}
      <div className={cn('max-w-[85%]', isUser && 'order-first')}>
        <div
          className={cn(
            'whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
          )}
        >
          {message.content}
        </div>
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.sources.slice(0, 5).map((source, index) => (
              <Link
                key={`${source.pageId}-${index}`}
                href={source.url}
                className="block rounded-md border bg-background px-2 py-1.5 text-xs hover:bg-accent"
              >
                <span className="flex items-center gap-1 font-medium">
                  [{index + 1}] {source.title}
                  {source.heading ? ` > ${source.heading}` : ''}
                  <ExternalLink className="h-3 w-3" />
                </span>
                {source.snippet && (
                  <span className="mt-0.5 line-clamp-2 block text-muted-foreground">
                    {source.snippet}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
      {isUser && (
        <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <User className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );
}

function extractPageId(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = /^\/pages\/([^/]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}
