import { prisma } from "./client";
import { assertWithinLimit } from "./limits";

/** Shape of a personal invite as shown on the public claim page. */
export interface PublicInvite {
  id: string;
  state: "active" | "accepted" | "expired";
  participant: { id: string; firstName: string; email: string | null; phone: string | null };
  organizationName: string;
  event: { id: string; title: string; startsAt: Date; timezone: string; location: string | null } | null;
  questions: PublicQuestion[];
}

/**
 * Public, unauthenticated flows — event self-registration via a shared link.
 * These functions deliberately bypass the tenant client (there is no signed-in
 * actor); every entry point re-checks that the event has opted into public
 * registration, so a leaked event id alone exposes nothing.
 */

export interface PublicQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "checkbox";
  required: boolean;
  options?: string[];
}

/** A card in the public /discover directory. */
export interface PublicEventCard {
  id: string;
  title: string;
  startsAt: Date;
  timezone: string;
  location: string | null;
  imageThumbKey: string | null;
  priceCents: number | null;
  organizationName: string;
  registrationCount: number;
}

/**
 * The public event directory: upcoming events whose host opted into LISTED
 * visibility. Optional free-text search over title / description / location /
 * host name. Sort by soonest (default) or most-registered ("popular").
 */
export async function listPublicEvents(
  opts: { q?: string; sort?: "soon" | "popular" } = {},
): Promise<PublicEventCard[]> {
  const q = opts.q?.trim();
  const events = await prisma.event.findMany({
    where: {
      visibility: "LISTED",
      startsAt: { gte: new Date() }, // only upcoming events
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { location: { contains: q, mode: "insensitive" } },
              { organization: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy:
      opts.sort === "popular"
        ? [{ registrations: { _count: "desc" } }, { startsAt: "asc" }]
        : [{ startsAt: "asc" }],
    take: 60,
    select: {
      id: true,
      title: true,
      startsAt: true,
      timezone: true,
      location: true,
      imageThumbKey: true,
      priceCents: true,
      organization: { select: { name: true } },
      _count: { select: { registrations: true } },
    },
  });

  return events.map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.startsAt,
    timezone: e.timezone,
    location: e.location,
    imageThumbKey: e.imageThumbKey,
    priceCents: e.priceCents,
    organizationName: e.organization.name,
    registrationCount: e._count.registrations,
  }));
}

/** Event info shown on the public registration page, or null if not public. */
export async function getPublicEvent(eventId: string) {
  const event = await prisma.event.findFirst({
    // Both UNLISTED and LISTED events register through the shared /r link.
    where: { id: eventId, visibility: { in: ["UNLISTED", "LISTED"] } },
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      startsAt: true,
      timezone: true,
      imageKey: true,
      priceCents: true,
      paymentLink: true,
      paymentInstructions: true,
      organization: { select: { name: true } },
      intakeForm: {
        select: { id: true, status: true, version: true, questions: true },
      },
    },
  });
  if (!event) return null;

  const questions: PublicQuestion[] =
    event.intakeForm && event.intakeForm.status === "PUBLISHED"
      ? (event.intakeForm.questions as unknown as PublicQuestion[])
      : [];

  return { ...event, questions };
}

/** Look up an invite by token for the public claim page. Null = unknown token. */
export async function getInviteByToken(token: string): Promise<PublicInvite | null> {
  const invite = await prisma.invite.findUnique({
    where: { token },
    select: {
      id: true,
      kind: true,
      acceptedAt: true,
      expiresAt: true,
      organization: { select: { name: true } },
      participant: {
        select: { id: true, firstName: true, email: true, phone: true },
      },
      event: {
        select: {
          id: true,
          title: true,
          startsAt: true,
          timezone: true,
          location: true,
          intakeForm: { select: { id: true, status: true, version: true, questions: true } },
        },
      },
    },
  });
  if (!invite || invite.kind !== "PARTICIPANT_CLAIM") return null;

  const intakeForm = invite.event?.intakeForm;
  const questions: PublicQuestion[] =
    intakeForm && intakeForm.status === "PUBLISHED"
      ? (intakeForm.questions as unknown as PublicQuestion[])
      : [];

  return {
    id: invite.id,
    state: invite.acceptedAt
      ? "accepted"
      : invite.expiresAt < new Date()
        ? "expired"
        : "active",
    participant: invite.participant,
    organizationName: invite.organization.name,
    event: invite.event
      ? {
          id: invite.event.id,
          title: invite.event.title,
          startsAt: invite.event.startsAt,
          timezone: invite.event.timezone,
          location: invite.event.location,
        }
      : null,
    questions,
  };
}

/**
 * Accept a personal invite: update the participant's contact info, record the
 * intake submission (if the linked event has a published form), and mark the
 * invite used. One-shot — an accepted invite can't be replayed.
 */
export async function acceptInvite(
  token: string,
  input: {
    email?: string;
    phone?: string;
    answers?: Array<{ questionId: string; label: string; value: string }>;
  },
): Promise<void> {
  const invite = await prisma.invite.findUnique({
    where: { token },
    select: {
      id: true,
      kind: true,
      acceptedAt: true,
      expiresAt: true,
      organizationId: true,
      participantId: true,
      eventId: true,
      event: {
        select: {
          intakeForm: { select: { id: true, status: true, version: true, questions: true } },
        },
      },
    },
  });
  if (!invite || invite.kind !== "PARTICIPANT_CLAIM") throw new Error("Invalid invite");
  if (invite.acceptedAt) throw new Error("Invite already used");
  if (invite.expiresAt < new Date()) throw new Error("Invite expired");

  const intakeForm = invite.event?.intakeForm;
  const questions: PublicQuestion[] =
    intakeForm && intakeForm.status === "PUBLISHED"
      ? (intakeForm.questions as unknown as PublicQuestion[])
      : [];

  for (const q of questions) {
    if (!q.required) continue;
    const answer = input.answers?.find((a) => a.questionId === q.id);
    if (!answer || !answer.value.trim()) {
      throw new Error(`Missing required answer: ${q.label}`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.participant.update({
      where: { id: invite.participantId },
      data: {
        ...(input.email ? { email: input.email } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        consentAt: new Date(),
      },
    });

    if (intakeForm && questions.length > 0 && input.answers?.length) {
      await tx.formSubmission.create({
        data: {
          organizationId: invite.organizationId,
          formTemplateId: intakeForm.id,
          formVersion: intakeForm.version,
          participantId: invite.participantId,
          eventId: invite.eventId,
          filledBy: "PARTICIPANT",
          answers: input.answers,
        },
      });
    }

    await tx.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        organizationId: invite.organizationId,
        actorUserId: null,
        action: "invite.accept",
        entityType: "Invite",
        entityId: invite.id,
        metadata: {
          participantId: invite.participantId,
          hasIntake: Boolean(input.answers?.length),
        },
      },
    });
  });
}

/**
 * Register a participant for a public event, with optional intake answers.
 * Required questions are enforced against the attached published form.
 */
export async function registerForEventPublic(
  eventId: string,
  input: {
    firstName: string;
    lastName?: string;
    email?: string;
    answers?: Array<{ questionId: string; label: string; value: string }>;
  },
): Promise<{ participantId: string }> {
  const event = await getPublicEvent(eventId);
  if (!event) throw new Error("This event is not open for registration");

  for (const q of event.questions) {
    if (!q.required) continue;
    const answer = input.answers?.find((a) => a.questionId === q.id);
    if (!answer || !answer.value.trim()) {
      throw new Error(`Missing required answer: ${q.label}`);
    }
  }

  const intakeForm = event.intakeForm;

  return prisma.$transaction(async (tx) => {
    const orgId = (await tx.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { organizationId: true },
    })).organizationId;

    // The host's plan caps participants; public sign-ups count toward it.
    await assertWithinLimit(orgId, "participants");

    const participant = await tx.participant.create({
      data: {
        organizationId: orgId,
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        email: input.email ?? null,
        consentAt: new Date(), // submitting the public form is the consent act
      },
    });

    await tx.eventRegistration.create({
      data: {
        organizationId: orgId,
        eventId,
        participantId: participant.id,
        source: "SELF",
      },
    });

    if (intakeForm && event.questions.length > 0 && input.answers?.length) {
      await tx.formSubmission.create({
        data: {
          organizationId: orgId,
          formTemplateId: intakeForm.id,
          formVersion: intakeForm.version,
          participantId: participant.id,
          eventId,
          filledBy: "PARTICIPANT",
          answers: input.answers,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: null,
        action: "public.register",
        entityType: "Participant",
        entityId: participant.id,
        metadata: { eventId, hasIntake: Boolean(input.answers?.length) },
      },
    });

    return { participantId: participant.id };
  });
}
