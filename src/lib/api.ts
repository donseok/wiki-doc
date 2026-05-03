/**
 * API helper utilities (server-side)
 */
import { NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export async function parseJson<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  const body = await req.json().catch(() => ({}));
  return schema.parse(body);
}

export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    return fail('잘못된 요청 형식입니다', 400, { issues: err.issues });
  }
  if (err instanceof Error) {
    console.error('[API Error]', err);
    return fail(err.message || '서버 오류', 500);
  }
  return fail('알 수 없는 오류', 500);
}
