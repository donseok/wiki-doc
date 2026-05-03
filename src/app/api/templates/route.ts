import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, parseJson, handleError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET — 템플릿 목록 (FR-211/212) */
export async function GET() {
  try {
    const templates = await prisma.template.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return ok(templates);
  } catch (err) {
    return handleError(err);
  }
}

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  category: z.string().optional(),
  contentMarkdown: z.string().default(''),
  icon: z.string().optional(),
});

/** POST — 사용자 정의 템플릿 등록 (FR-212) */
export async function POST(req: NextRequest) {
  try {
    const body = await parseJson(req, CreateTemplateSchema);
    const created = await prisma.template.create({
      data: { ...body, isSystem: false },
    });
    return ok(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
