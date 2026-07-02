import { encryptField, decryptField } from "@convene/core";
import { recordAudit } from "./audit";
import { prisma } from "./client";

/**
 * The org-scoped data-access layer. ALL tenant data flows through here so
 * feature code can never accidentally cross tenants — every query is scoped to
 * `organizationId`. Health-data access is audited, and the free-text note runs
 * through the encryption seam.
 *
 * Usage:
 *   const db = createTenantClient(orgId, currentUserId);
 *   await db.participants.list();
 *   await db.healthReadings.create({ participantId, systolic, diastolic });
 */
export function createTenantClient(organizationId: string, actorUserId?: string | null) {
  return {
    organizationId,

    participants: {
      list() {
        return prisma.participant.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
        });
      },
      get(id: string) {
        return prisma.participant.findFirst({ where: { id, organizationId } });
      },
      create(data: {
        firstName: string;
        lastName?: string;
        email?: string;
        phone?: string;
      }) {
        return prisma.participant.create({
          data: {
            organizationId,
            firstName: data.firstName,
            lastName: data.lastName ?? null,
            email: data.email ?? null,
            phone: data.phone ?? null,
          },
        });
      },
    },

    healthReadings: {
      async create(input: {
        participantId: string;
        systolic: number;
        diastolic: number;
        pulse?: number;
        note?: string;
      }) {
        // Enforce that the participant belongs to THIS organization.
        const participant = await prisma.participant.findFirst({
          where: { id: input.participantId, organizationId },
          select: { id: true },
        });
        if (!participant) {
          throw new Error("Participant not found in this organization");
        }

        const reading = await prisma.healthReading.create({
          data: {
            organizationId,
            participantId: input.participantId,
            systolic: input.systolic,
            diastolic: input.diastolic,
            pulse: input.pulse ?? null,
            note: encryptField(input.note ?? null),
            takenByUserId: actorUserId ?? null,
          },
        });

        await recordAudit({
          organizationId,
          actorUserId,
          action: "health_reading.create",
          entityType: "HealthReading",
          entityId: reading.id,
          metadata: { participantId: input.participantId },
        });

        return { ...reading, note: decryptField(reading.note) };
      },

      async listForParticipant(participantId: string) {
        const rows = await prisma.healthReading.findMany({
          where: { organizationId, participantId },
          orderBy: { takenAt: "desc" },
        });

        await recordAudit({
          organizationId,
          actorUserId,
          action: "health_reading.read",
          entityType: "Participant",
          entityId: participantId,
          metadata: { count: rows.length },
        });

        return rows.map((r) => ({ ...r, note: decryptField(r.note) }));
      },
    },
  };
}

export type TenantClient = ReturnType<typeof createTenantClient>;
