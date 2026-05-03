import 'server-only';

import type { ChatContextDocument } from '@/lib/chat/retrieval';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface BuildChatPromptInput {
  question: string;
  documents: ChatContextDocument[];
  history?: ChatHistoryMessage[];
}

const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CHARS = 6000;

export function buildChatPrompt(input: BuildChatPromptInput): string {
  const history = formatHistory(input.history ?? []);
  const context = formatDocuments(input.documents);

  return [
    '당신은 PI Wiki 전용 챗봇입니다.',
    '반드시 제공된 위키 컨텍스트에 근거해서만 답변하세요.',
    '컨텍스트에 없는 내용은 추측하지 말고, "위키에서 확인할 수 없습니다"라고 답하세요.',
    '답변은 기본적으로 한국어로 작성하세요.',
    '중요한 주장에는 문서 번호를 [1], [2]처럼 표시하세요.',
    '가능하면 짧은 요약을 먼저 제시하고, 필요한 경우 실행 가능한 다음 단계를 제안하세요.',
    '',
    '대화 이력:',
    history || '(없음)',
    '',
    '위키 컨텍스트:',
    context || '(검색된 문서 없음)',
    '',
    `사용자 질문: ${input.question}`,
  ].join('\n');
}

function formatDocuments(documents: ChatContextDocument[]): string {
  return documents
    .map((doc, index) =>
      [
        `[${index + 1}] ${doc.title}`,
        ...(doc.heading ? [`heading: ${doc.heading}`] : []),
        `pageId: ${doc.pageId}`,
        `url: ${doc.url}`,
        `status: ${doc.status}`,
        `updatedAt: ${doc.updatedAt}`,
        'content:',
        doc.content || '(본문 없음)',
      ].join('\n'),
    )
    .join('\n\n---\n\n');
}

function formatHistory(history: ChatHistoryMessage[]): string {
  const recent = history.slice(-MAX_HISTORY_MESSAGES);
  let remaining = MAX_HISTORY_CHARS;
  const lines: string[] = [];

  for (const item of recent) {
    if (remaining <= 0) break;
    const prefix = item.role === 'user' ? '사용자' : '챗봇';
    const content = item.content.trim().slice(0, remaining);
    remaining -= content.length;
    if (content) lines.push(`${prefix}: ${content}`);
  }

  return lines.join('\n');
}
