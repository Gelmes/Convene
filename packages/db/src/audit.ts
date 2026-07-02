import { prisma } from "./client";

/**
 * Append an audit-log entry. Called for every sensitive action — especially
 * all reads/writes of health data. This is the seam that lets us satisfy a
 * future clinical/HIPAA posture without retrofitting.
 */
export async function recordAudit(params: {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      metadata: (params.metadata ?? {}) as object,
    },
  });
}
