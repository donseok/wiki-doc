/**
 * Edit Lock — FR-215, FR-216
 *
 * 한 페이지당 하나의 활성 EditSession을 보장하고,
 * 5분 유휴 시 자동 만료된다 (heartbeat로 갱신 가능).
 *
 * - acquire(pageId, editor)         : Lock 획득. 본인 보유 중이면 갱신.
 *                                     타인 보유이면 LockConflictError throw.
 * - heartbeat(pageId, editor)       : 활성 사용자가 주기적으로 호출해 expiresAt 연장.
 * - release(pageId, editor)         : 본인 Lock 해제.
 * - forceRelease(pageId, requester) : FR-216 강제 해제. 원래 보유자에게 알림 생성.
 * - status(pageId)                  : 현재 Lock 상태 조회 (UI 표시용).
 */

import { prisma } from './db';
import type { EditSession } from '@prisma/client';

const TIMEOUT_MIN = Number(process.env.EDIT_LOCK_TIMEOUT_MINUTES ?? 5);

export class LockConflictError extends Error {
  readonly currentEditor: string;
  readonly expiresAt: Date;
  constructor(editor: string, expiresAt: Date) {
    super(`페이지가 ${editor}님에 의해 편집 중입니다`);
    this.name = 'LockConflictError';
    this.currentEditor = editor;
    this.expiresAt = expiresAt;
  }
}

function newExpiry(): Date {
  return new Date(Date.now() + TIMEOUT_MIN * 60_000);
}

function isExpired(session: EditSession): boolean {
  return session.expiresAt.getTime() <= Date.now();
}

export interface LockStatus {
  locked: boolean;
  editor?: string;
  startedAt?: Date;
  expiresAt?: Date;
  isMine?: boolean;
}

export async function status(pageId: string, viewer?: string): Promise<LockStatus> {
  const s = await prisma.editSession.findUnique({ where: { pageId } });
  if (!s || isExpired(s)) return { locked: false };
  return {
    locked: true,
    editor: s.editorName,
    startedAt: s.startedAt,
    expiresAt: s.expiresAt,
    isMine: viewer != null && s.editorName === viewer,
  };
}

export async function acquire(pageId: string, editor: string): Promise<EditSession> {
  // 페이지 존재 확인
  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { id: true } });
  if (!page) throw new Error('페이지를 찾을 수 없습니다');

  const existing = await prisma.editSession.findUnique({ where: { pageId } });

  // 만료된 경우 또는 본인 보유 → upsert로 갱신
  if (!existing || isExpired(existing) || existing.editorName === editor) {
    return prisma.editSession.upsert({
      where: { pageId },
      update: {
        editorName: editor,
        expiresAt: newExpiry(),
        lastActivityAt: new Date(),
        forceReleased: false,
        forceReleasedBy: null,
      },
      create: {
        pageId,
        editorName: editor,
        expiresAt: newExpiry(),
      },
    });
  }

  // 타인 보유 중
  throw new LockConflictError(existing.editorName, existing.expiresAt);
}

export async function heartbeat(pageId: string, editor: string): Promise<EditSession | null> {
  const s = await prisma.editSession.findUnique({ where: { pageId } });
  if (!s) return null;
  if (s.editorName !== editor) {
    throw new LockConflictError(s.editorName, s.expiresAt);
  }
  if (isExpired(s)) return null;
  return prisma.editSession.update({
    where: { pageId },
    data: {
      expiresAt: newExpiry(),
      lastActivityAt: new Date(),
    },
  });
}

export async function release(pageId: string, editor: string): Promise<void> {
  const s = await prisma.editSession.findUnique({ where: { pageId } });
  if (!s) return;
  if (s.editorName !== editor && !isExpired(s)) {
    throw new LockConflictError(s.editorName, s.expiresAt);
  }
  await prisma.editSession.delete({ where: { pageId } }).catch(() => undefined);
}

export async function forceRelease(pageId: string, requester: string): Promise<EditSession | null> {
  const s = await prisma.editSession.findUnique({ where: { pageId } });
  if (!s) return null;

  // 본인 Lock이면 그냥 release 호출과 동일
  if (s.editorName === requester) {
    await prisma.editSession.delete({ where: { pageId } });
    return s;
  }

  // 강제 해제 + 원래 보유자에게 알림
  await prisma.$transaction([
    prisma.editSession.delete({ where: { pageId } }),
    prisma.notification.create({
      data: {
        recipient: s.editorName,
        type: 'page_updated', // forceLockRelease 전용 타입을 추가해도 무방
        payload: {
          kind: 'edit_lock_force_released',
          pageId,
          requester,
          message: `${requester}님이 편집 잠금을 강제 해제했습니다`,
        },
      },
    }),
  ]);
  return s;
}
