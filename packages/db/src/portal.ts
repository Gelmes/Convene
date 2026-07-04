import { decryptField } from "@convene/core";
import { recordAudit } from "./audit";
import { prisma } from "./client";

/**
 * Participant portal — the signed-in user's own data across all organizations.
 *
 * Claiming: magic-link sign-in proves email ownership, so any unclaimed
 * participant record carrying that email is auto-linked to the user here
 * (`Participant.userId`). Hosts should double-check emails they type — the
 * address owner will be able to see the record. Token-based claiming can be
 * layered on later for a stricter posture.
 */
export async function getPortalData(userId: string, email?: string | null) {
  if (email) {
    await prisma.participant.updateMany({
      where: { email, userId: null },
      data: { userId },
    });
  }

  const participants = await prisma.participant.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      organization: { select: { id: true, name: true } },
      registrations: {
        orderBy: { event: { startsAt: "desc" } },
        include: {
          event: {
            select: { id: true, title: true, startsAt: true, location: true },
          },
        },
      },
      healthReadings: { orderBy: { takenAt: "desc" } },
      formSubmissions: {
        orderBy: { createdAt: "desc" },
        include: { formTemplate: { select: { name: true } } },
      },
    },
  });

  // Reading own health data is still an audited access.
  await Promise.all(
    participants
      .filter((p) => p.healthReadings.length > 0)
      .map((p) =>
        recordAudit({
          organizationId: p.organizationId,
          actorUserId: userId,
          action: "health_reading.read",
          entityType: "Participant",
          entityId: p.id,
          metadata: { count: p.healthReadings.length, via: "portal" },
        }),
      ),
  );

  return participants.map((p) => ({
    ...p,
    healthReadings: p.healthReadings.map((r) => ({
      ...r,
      note: decryptField(r.note),
    })),
  }));
}

export type PortalParticipant = Awaited<ReturnType<typeof getPortalData>>[number];
