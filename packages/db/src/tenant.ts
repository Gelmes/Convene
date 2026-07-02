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
 *   await db.events.list();
 *   await db.healthReadings.create({ participantId, systolic, diastolic, eventId });
 */
export function createTenantClient(organizationId: string, actorUserId?: string | null) {
  return {
    organizationId,

    // --- Participants -------------------------------------------------------
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

    // --- Events -------------------------------------------------------------
    events: {
      list() {
        return prisma.event.findMany({
          where: { organizationId },
          orderBy: { startsAt: "desc" },
          include: { _count: { select: { registrations: true } } },
        });
      },
      get(id: string) {
        return prisma.event.findFirst({ where: { id, organizationId } });
      },
      create(data: {
        title: string;
        description?: string;
        location?: string;
        startsAt: Date;
        endsAt?: Date;
      }) {
        return prisma.event.create({
          data: {
            organizationId,
            title: data.title,
            description: data.description ?? null,
            location: data.location ?? null,
            startsAt: data.startsAt,
            endsAt: data.endsAt ?? null,
          },
        });
      },
    },

    // --- Registrations (roster) --------------------------------------------
    registrations: {
      listForEvent(eventId: string) {
        return prisma.eventRegistration.findMany({
          where: { organizationId, eventId },
          orderBy: { createdAt: "asc" },
          include: { participant: true },
        });
      },
      /**
       * Add a participant to an event on the spot (creates the participant too).
       * Pass a client-generated `participantId` (offline outbox) to make the
       * call idempotent — replaying the same op is a no-op.
       */
      async addNewParticipant(
        eventId: string,
        data: { firstName: string; lastName?: string; email?: string; phone?: string },
        participantId?: string,
      ) {
        const event = await prisma.event.findFirst({
          where: { id: eventId, organizationId },
          select: { id: true },
        });
        if (!event) throw new Error("Event not found in this organization");

        return prisma.$transaction(async (tx) => {
          let pid = participantId;
          if (pid) {
            // Idempotent path: create only if this id doesn't exist yet, and
            // never touch a row that belongs to another organization.
            const existing = await tx.participant.findUnique({
              where: { id: pid },
              select: { id: true, organizationId: true },
            });
            if (existing && existing.organizationId !== organizationId) {
              throw new Error("Participant id conflict");
            }
            if (!existing) {
              await tx.participant.create({
                data: {
                  id: pid,
                  organizationId,
                  firstName: data.firstName,
                  lastName: data.lastName ?? null,
                  email: data.email ?? null,
                  phone: data.phone ?? null,
                },
              });
            }
          } else {
            const participant = await tx.participant.create({
              data: {
                organizationId,
                firstName: data.firstName,
                lastName: data.lastName ?? null,
                email: data.email ?? null,
                phone: data.phone ?? null,
              },
            });
            pid = participant.id;
          }

          return tx.eventRegistration.upsert({
            where: { eventId_participantId: { eventId, participantId: pid } },
            create: {
              organizationId,
              eventId,
              participantId: pid,
              source: "HOST_ADDED",
            },
            update: {},
            include: { participant: true },
          });
        });
      },
      setStatus(registrationId: string, status: "REGISTERED" | "CHECKED_IN" | "ATTENDED" | "NO_SHOW") {
        return prisma.eventRegistration.updateMany({
          where: { id: registrationId, organizationId },
          data: { status },
        });
      },
    },

    // --- Health readings (isolated + audited + encrypted note) --------------
    healthReadings: {
      async create(input: {
        participantId: string;
        systolic: number;
        diastolic: number;
        pulse?: number;
        note?: string;
        eventId?: string;
        /** Client-generated UUID (offline outbox) — makes the call idempotent. */
        id?: string;
        /** When the reading was actually taken (offline capture time). */
        takenAt?: Date;
      }) {
        // Idempotency: a replayed op returns the existing row untouched.
        if (input.id) {
          const existing = await prisma.healthReading.findUnique({
            where: { id: input.id },
          });
          if (existing) {
            if (existing.organizationId !== organizationId) {
              throw new Error("Reading id conflict");
            }
            return { ...existing, note: decryptField(existing.note) };
          }
        }

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
            ...(input.id ? { id: input.id } : {}),
            organizationId,
            participantId: input.participantId,
            eventId: input.eventId ?? null,
            systolic: input.systolic,
            diastolic: input.diastolic,
            pulse: input.pulse ?? null,
            note: encryptField(input.note ?? null),
            takenByUserId: actorUserId ?? null,
            ...(input.takenAt ? { takenAt: input.takenAt } : {}),
          },
        });

        await recordAudit({
          organizationId,
          actorUserId,
          action: "health_reading.create",
          entityType: "HealthReading",
          entityId: reading.id,
          metadata: { participantId: input.participantId, eventId: input.eventId ?? null },
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

      /** All readings taken at an event (newest first). One audit row per view. */
      async listForEvent(eventId: string) {
        const rows = await prisma.healthReading.findMany({
          where: { organizationId, eventId },
          orderBy: { takenAt: "desc" },
        });

        await recordAudit({
          organizationId,
          actorUserId,
          action: "health_reading.read",
          entityType: "Event",
          entityId: eventId,
          metadata: { count: rows.length },
        });

        return rows.map((r) => ({ ...r, note: decryptField(r.note) }));
      },
    },
  };
}

export type TenantClient = ReturnType<typeof createTenantClient>;

/**
 * Membership guard: returns the caller's role in the org, or null if they are
 * not a member. Feature code must call this before creating a tenant client.
 */
export async function getMembershipRole(
  userId: string,
  organizationId: string,
): Promise<"OWNER" | "ADMIN" | "FACILITATOR" | "STAFF" | null> {
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { role: true, status: true },
  });
  if (!membership || membership.status === "DISABLED") return null;
  return membership.role;
}
