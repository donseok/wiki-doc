import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

type Client = typeof prisma | Prisma.TransactionClient;

interface WriteAuditInput {
  entity: string;
  entityId: string;
  action: string;
  actor: string;
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(input: WriteAuditInput, client: Client = prisma) {
  return client.auditLog.create({
    data: {
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      actor: input.actor,
      before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

// 감사 로그 실패가 본 작업 실패로 이어지면 안 되는 경우(NFR-304 best-effort 기록) 에 사용.
export async function writeAuditSafe(input: WriteAuditInput, client: Client = prisma) {
  try {
    return await writeAudit(input, client);
  } catch {
    return null;
  }
}
