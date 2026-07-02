import { prisma } from "./client";

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

/** Event info shown on the public registration page, or null if not public. */
export async function getPublicEvent(eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, publicRegistration: true },
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      startsAt: true,
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
