/**
 * 알림 헬퍼 — FR-901 ~ FR-906
 *
 * 페이지 변경 이벤트 발생 시 watcher 들에게 Notification 일괄 생성.
 *
 * TODO 호출 위치:
 *   - src/app/api/pages/[id]/route.ts PUT (본문/상태 변경 후) → notifyPageChange
 *   - src/app/api/pages/[id]/comments/route.ts POST → notifyPageChange(type='comment')
 *   - 멘션 검출 시 → notifyMention
 */

import { prisma } from './db';
import { NotificationType } from '@prisma/client';

export interface PageChangeEvent {
  pageId: string;
  type: NotificationType;          // 'comment' | 'status_change' | 'page_updated' | 'mention' | 'pending_decision'
  actor: string;                   // 변경 일으킨 사람 (자기 자신은 제외)
  payload?: Record<string, unknown>;
}

/**
 * 해당 페이지의 watcher + 상위 트리 노드 watcher(includeChildren=true) 를 모아
 * 일괄 Notification 을 생성한다.
 */
export async function notifyPageChange(evt: PageChangeEvent): Promise<number> {
  // 1) 페이지의 직접 watcher
  const directWatchers = await prisma.pageWatch.findMany({
    where: { pageId: evt.pageId },
    select: { watcherName: true },
  });

  // 2) 페이지가 속한 트리 + 모든 조상 트리 노드 중 includeChildren=true 인 watcher
  const page = await prisma.page.findUnique({
    where: { id: evt.pageId },
    select: { treeNodeId: true },
  });
  const ancestorIds: string[] = [];
  if (page) {
    let cur: string | null = page.treeNodeId;
    while (cur) {
      ancestorIds.push(cur);
      const parentRow: { parentId: string | null } | null = await prisma.treeNode.findUnique({
        where: { id: cur },
        select: { parentId: true },
      });
      cur = parentRow?.parentId ?? null;
    }
  }
  const ancestorWatchers = ancestorIds.length
    ? await prisma.pageWatch.findMany({
        where: { treeNodeId: { in: ancestorIds }, includeChildren: true },
        select: { watcherName: true },
      })
    : [];

  // 3) 합집합 - actor 본인 제외
  const recipients = new Set<string>();
  for (const w of [...directWatchers, ...ancestorWatchers]) {
    if (w.watcherName !== evt.actor) recipients.add(w.watcherName);
  }
  if (recipients.size === 0) return 0;

  const data = Array.from(recipients).map((recipient) => ({
    recipient,
    type: evt.type,
    payload: { pageId: evt.pageId, actor: evt.actor, ...(evt.payload ?? {}) },
  }));
  await prisma.notification.createMany({ data });

  // FR-904 — 이메일 동시 발송 (SMTP 미설정 시 no-op, 화이트리스트 type 만)
  try {
    const { maybeSendEmailForNotification } = await import('./email');
    await Promise.allSettled(
      data.map((n) =>
        maybeSendEmailForNotification({
          recipient: n.recipient,
          type: n.type,
          payload: n.payload,
        }),
      ),
    );
  } catch (e) {
    console.warn('[notify] email dispatch 실패', e);
  }

  return recipients.size;
}

/**
 * 멘션 추출 후 멘션 대상자에게 알림.
 * TODO(FR-504): 인증 도입 시 사용자 목록과 매칭.
 */
export async function notifyMention(opts: {
  pageId: string;
  actor: string;
  body: string;
}): Promise<number> {
  const matches = Array.from(opts.body.matchAll(/@([\w가-힣.\-_]+)/g));
  const targets = Array.from(new Set(matches.map((m) => m[1]))).filter((u) => u !== opts.actor);
  if (!targets.length) return 0;
  const data = targets.map((recipient) => ({
    recipient,
    type: 'mention' as const,
    payload: {
      pageId: opts.pageId,
      actor: opts.actor,
      snippet: opts.body.slice(0, 200),
      message: `${opts.actor}님이 코멘트에서 @${recipient} 를 멘션했습니다`,
    },
  }));
  await prisma.notification.createMany({ data });

  // FR-904 이메일
  try {
    const { maybeSendEmailForNotification } = await import('./email');
    await Promise.allSettled(
      data.map((n) =>
        maybeSendEmailForNotification({
          recipient: n.recipient,
          type: n.type,
          payload: n.payload,
        }),
      ),
    );
  } catch (e) {
    console.warn('[notify] mention email 실패', e);
  }
  return targets.length;
}
