import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, handleError, ok, parseJson } from '@/lib/api';
import { generateText } from '@/lib/openai';
import { retrieveChatContext } from '@/lib/chat/retrieval';
import { buildChatPrompt } from '@/lib/chat/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  pageId: z.string().nullable().optional(),
  space: z.string().nullable().optional(),
  sessionId: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      }),
    )
    .max(12)
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, ChatRequestSchema);
    const context = await retrieveChatContext({
      message: body.message,
      pageId: body.pageId,
      space: body.space,
    });

    if (context.documents.length === 0) {
      return ok({
        answer: '관련 위키 문서를 찾지 못했습니다. 질문 키워드를 더 구체적으로 입력해 주세요.',
        model: null,
        sources: [],
      });
    }

    const prompt = buildChatPrompt({
      question: body.message,
      documents: context.documents,
      history: body.history,
    });

    try {
      const completion = await generateText(prompt);
      return ok({
        answer: completion.text,
        model: completion.model,
        sources: context.sources,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('OPENAI_API_KEY')) {
        return fail('OPENAI_API_KEY가 설정되어 있지 않습니다.', 503);
      }
      throw err;
    }
  } catch (err) {
    return handleError(err);
  }
}
