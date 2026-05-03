import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as EditLock from '@/lib/edit-lock';
import { ok, parseJson, handleError, fail } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET — 현재 잠금 상태 조회 (FR-215 안내 표시용) */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = getCurrentUserServer();
    const status = await EditLock.status(params.id, me);
    return ok(status);
  } catch (err) {
    return handleError(err);
  }
}

const ActionSchema = z.object({
  action: z.enum(['acquire', 'heartbeat', 'release', 'force-release']),
});

/** POST — Lock 라이프사이클 동작 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { action } = await parseJson(req, ActionSchema);
    const me = getCurrentUserServer();

    switch (action) {
      case 'acquire': {
        try {
          const session = await EditLock.acquire(params.id, me);
          return ok(session);
        } catch (e) {
          if (e instanceof EditLock.LockConflictError) {
            return fail(e.message, 409, {
              currentEditor: e.currentEditor,
              expiresAt: e.expiresAt,
            });
          }
          throw e;
        }
      }
      case 'heartbeat': {
        try {
          const session = await EditLock.heartbeat(params.id, me);
          return ok(session);
        } catch (e) {
          if (e instanceof EditLock.LockConflictError) {
            return fail(e.message, 409, {
              currentEditor: e.currentEditor,
              expiresAt: e.expiresAt,
            });
          }
          throw e;
        }
      }
      case 'release': {
        await EditLock.release(params.id, me);
        return ok({ released: true });
      }
      case 'force-release': {
        const previous = await EditLock.forceRelease(params.id, me);
        return ok({ released: true, previous });
      }
    }
  } catch (err) {
    return handleError(err);
  }
}
