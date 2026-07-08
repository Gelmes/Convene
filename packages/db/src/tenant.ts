import { encryptField, decryptField } from "@convene/core";
import { recordAudit } from "./audit";
import { prisma } from "./client";
import { assertWithinLimit } from "./limits";

/**
 * Does the participant meet this stage's requirements?
 * Returns null when the stage has no requirements (host judgment),
 * otherwise true/false. Attendance = checked-in/attended registration OR a BP
 * reading captured at a linked event (being measured there proves presence).
 */
async function meetsStageRequirements(
  organizationId: string,
  participantId: string,
  stage: { events: Array<{ id: string }>; requiredFormTemplateId: string | null },
): Promise<boolean | null> {
  const needsEvent = stage.events.length > 0;
  const needsForm = Boolean(stage.requiredFormTemplateId);
  if (!needsEvent && !needsForm) return null;

  const stageEventIds = stage.events.map((ev) => ev.id);
  const [attended, submitted] = await Promise.all([
    needsEvent
      ? Promise.all([
          prisma.eventRegistration.findFirst({
            where: {
              organizationId,
              participantId,
              eventId: { in: stageEventIds },
              status: { in: ["CHECKED_IN", "ATTENDED"] },
            },
            select: { id: true },
          }),
          prisma.healthReading.findFirst({
            where: {
              organizationId,
              participantId,
              eventId: { in: stageEventIds },
            },
            select: { id: true },
          }),
        ]).then(([reg, reading]) => Boolean(reg ?? reading))
      : Promise.resolve(true),
    needsForm
      ? prisma.formSubmission
          .findFirst({
            where: {
              organizationId,
              participantId,
              formTemplateId: stage.requiredFormTemplateId!,
            },
            select: { id: true },
          })
          .then(Boolean)
      : Promise.resolve(true),
  ]);
  return attended && submitted;
}

/** Complete the enrollment's current stage and move to the next (or finish). */
async function advanceEnrollment(
  organizationId: string,
  enrollmentId: string,
): Promise<void> {
  const enrollment = await prisma.programEnrollment.findFirst({
    where: { id: enrollmentId, organizationId },
    include: {
      currentStage: { select: { id: true, programId: true, order: true } },
    },
  });
  if (!enrollment?.currentStage) return;

  const next = await prisma.stage.findFirst({
    where: {
      programId: enrollment.currentStage.programId,
      order: { gt: enrollment.currentStage.order },
    },
    orderBy: { order: "asc" },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.stageCompletion.upsert({
      where: {
        enrollmentId_stageId: {
          enrollmentId,
          stageId: enrollment.currentStage.id,
        },
      },
      create: { organizationId, enrollmentId, stageId: enrollment.currentStage.id },
      update: {},
    }),
    prisma.programEnrollment.update({
      where: { id: enrollmentId },
      data: next
        ? { currentStageId: next.id }
        : { currentStageId: null, status: "COMPLETED" },
    }),
  ]);
}

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
      async create(data: {
        firstName: string;
        lastName?: string;
        email?: string;
        phone?: string;
      }) {
        await assertWithinLimit(organizationId, "participants");
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
        return prisma.event.findFirst({
          where: { id, organizationId },
          include: {
            intakeForm: {
              select: { id: true, name: true, status: true, version: true },
            },
          },
        });
      },
      /** Attach/detach the intake form shown at public registration. */
      async setIntakeForm(eventId: string, formTemplateId: string | null) {
        if (formTemplateId) {
          const form = await prisma.formTemplate.findFirst({
            where: { id: formTemplateId, organizationId },
            select: { id: true },
          });
          if (!form) throw new Error("Form not found in this organization");
        }
        return prisma.event.updateMany({
          where: { id: eventId, organizationId },
          data: { intakeFormTemplateId: formTemplateId },
        });
      },
      setPublicRegistration(eventId: string, enabled: boolean) {
        return prisma.event.updateMany({
          where: { id: eventId, organizationId },
          data: { publicRegistration: enabled },
        });
      },
      rename(eventId: string, title: string) {
        return prisma.event.updateMany({
          where: { id: eventId, organizationId },
          data: { title },
        });
      },
      /** Edit the event's core details (title, description, location, start). */
      update(
        eventId: string,
        data: {
          title: string;
          description?: string | null;
          location?: string | null;
          startsAt: Date;
        },
      ) {
        return prisma.event.updateMany({
          where: { id: eventId, organizationId },
          data: {
            title: data.title,
            description: data.description ?? null,
            location: data.location ?? null,
            startsAt: data.startsAt,
          },
        });
      },
      /**
       * Deletes the event and its registrations + photo records; BP readings,
       * form submissions, and invites are KEPT (their event link nulls out).
       * Returns the R2 storage keys of deleted photos so the caller can remove
       * the binaries.
       */
      async delete(eventId: string): Promise<string[]> {
        const photos = await prisma.photo.findMany({
          where: { eventId, organizationId },
          select: { storageKey: true, thumbKey: true },
        });
        const result = await prisma.event.deleteMany({
          where: { id: eventId, organizationId },
        });
        return result.count > 0
          ? photos.flatMap((p) => [p.storageKey, ...(p.thumbKey ? [p.thumbKey] : [])])
          : [];
      },
      /** Mode A payment settings: price + the host's own payment channel. */
      setPayment(
        eventId: string,
        data: {
          priceCents: number | null;
          paymentLink: string | null;
          paymentInstructions: string | null;
        },
      ) {
        return prisma.event.updateMany({
          where: { id: eventId, organizationId },
          data,
        });
      },
      /** Link this event to a program stage (attending it satisfies the stage). */
      async setStage(eventId: string, stageId: string | null) {
        if (stageId) {
          const stage = await prisma.stage.findFirst({
            where: { id: stageId, organizationId },
            select: { id: true },
          });
          if (!stage) throw new Error("Stage not found in this organization");
        }
        return prisma.event.updateMany({
          where: { id: eventId, organizationId },
          data: { stageId },
        });
      },
      async create(data: {
        title: string;
        description?: string;
        location?: string;
        startsAt: Date;
        endsAt?: Date;
      }) {
        await assertWithinLimit(organizationId, "events");
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
              await assertWithinLimit(organizationId, "participants");
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
            await assertWithinLimit(organizationId, "participants");
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
      /** Most recent event registration for a participant (invites attach to it). */
      latestForParticipant(participantId: string) {
        return prisma.eventRegistration.findFirst({
          where: { organizationId, participantId },
          orderBy: { createdAt: "desc" },
          include: { event: { select: { id: true, title: true } } },
        });
      },
      /** Mode A: host-confirmed payment toggle. Idempotent — replaying the
       *  same op lands on the same state. */
      setPaid(eventId: string, participantId: string, paid: boolean) {
        return prisma.eventRegistration.updateMany({
          where: { eventId, participantId, organizationId },
          data: { paidAt: paid ? new Date() : null },
        });
      },
      /** Mark a participant as checked in at an event (idempotent; never
       *  downgrades an ATTENDED registration). */
      async checkIn(eventId: string, participantId: string) {
        const event = await prisma.event.findFirst({
          where: { id: eventId, organizationId },
          select: { id: true },
        });
        if (!event) throw new Error("Event not found in this organization");
        return prisma.eventRegistration.upsert({
          where: { eventId_participantId: { eventId, participantId } },
          create: {
            organizationId,
            eventId,
            participantId,
            status: "CHECKED_IN",
            source: "HOST_ADDED",
          },
          update: { status: "CHECKED_IN" },
        });
      },
      setStatus(registrationId: string, status: "REGISTERED" | "CHECKED_IN" | "ATTENDED" | "NO_SHOW") {
        return prisma.eventRegistration.updateMany({
          where: { id: registrationId, organizationId },
          data: { status },
        });
      },
    },

    // --- Intake forms ---------------------------------------------------------
    forms: {
      list() {
        return prisma.formTemplate.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
          include: { _count: { select: { submissions: true } } },
        });
      },
      listPublished() {
        return prisma.formTemplate.findMany({
          where: { organizationId, status: "PUBLISHED" },
          orderBy: { name: "asc" },
        });
      },
      get(id: string) {
        return prisma.formTemplate.findFirst({
          where: { id, organizationId },
          include: { _count: { select: { submissions: true } } },
        });
      },
      async create(data: { name: string; description?: string }) {
        await assertWithinLimit(organizationId, "forms");
        return prisma.formTemplate.create({
          data: {
            organizationId,
            name: data.name,
            description: data.description ?? null,
          },
        });
      },
      /** Replace the question list (already validated by formQuestionsSchema). */
      updateQuestions(id: string, questions: unknown[]) {
        return prisma.formTemplate.updateMany({
          where: { id, organizationId },
          data: { questions: questions as object[] },
        });
      },
      rename(id: string, name: string) {
        return prisma.formTemplate.updateMany({
          where: { id, organizationId },
          data: { name },
        });
      },
      /** Archive: form disappears from pickers but submissions stay readable. */
      archive(id: string) {
        return prisma.formTemplate.updateMany({
          where: { id, organizationId },
          data: { status: "ARCHIVED" },
        });
      },
      unarchive(id: string) {
        return prisma.formTemplate.updateMany({
          where: { id, organizationId },
          data: { status: "PUBLISHED" },
        });
      },
      /** Hard delete — only allowed when the form has NO submissions, because
       *  deleting would cascade them away. Archive instead when it has data. */
      async delete(id: string) {
        const count = await prisma.formSubmission.count({
          where: { formTemplateId: id, organizationId },
        });
        if (count > 0) {
          throw new Error(
            `This form has ${count} submission${count === 1 ? "" : "s"} — archive it instead of deleting`,
          );
        }
        return prisma.formTemplate.deleteMany({ where: { id, organizationId } });
      },
      /** Publish a draft; re-publishing after edits bumps the version. */
      async publish(id: string) {
        const form = await prisma.formTemplate.findFirst({
          where: { id, organizationId },
          select: { status: true, version: true },
        });
        if (!form) throw new Error("Form not found in this organization");
        return prisma.formTemplate.updateMany({
          where: { id, organizationId },
          data: {
            status: "PUBLISHED",
            version: form.status === "PUBLISHED" ? form.version + 1 : form.version,
          },
        });
      },
    },

    // --- Form submissions -----------------------------------------------------
    submissions: {
      async create(input: {
        formTemplateId: string;
        participantId: string;
        eventId?: string;
        answers: Array<{ questionId: string; label: string; value: string }>;
        filledBy: "PARTICIPANT" | "HOST";
      }) {
        const [form, participant] = await Promise.all([
          prisma.formTemplate.findFirst({
            where: { id: input.formTemplateId, organizationId },
            select: { id: true, version: true },
          }),
          prisma.participant.findFirst({
            where: { id: input.participantId, organizationId },
            select: { id: true },
          }),
        ]);
        if (!form) throw new Error("Form not found in this organization");
        if (!participant) throw new Error("Participant not found in this organization");

        const submission = await prisma.formSubmission.create({
          data: {
            organizationId,
            formTemplateId: form.id,
            formVersion: form.version,
            participantId: input.participantId,
            eventId: input.eventId ?? null,
            filledBy: input.filledBy,
            submittedByUserId: actorUserId ?? null,
            answers: input.answers,
          },
        });

        await recordAudit({
          organizationId,
          actorUserId,
          action: "form_submission.create",
          entityType: "FormSubmission",
          entityId: submission.id,
          metadata: {
            participantId: input.participantId,
            formTemplateId: form.id,
            filledBy: input.filledBy,
          },
        });

        return submission;
      },

      listForParticipant(participantId: string) {
        return prisma.formSubmission.findMany({
          where: { organizationId, participantId },
          orderBy: { createdAt: "desc" },
          include: { formTemplate: { select: { name: true } } },
        });
      },
    },

    // --- Invites (personal claim links) ---------------------------------------
    invites: {
      /** Latest usable invite for a participant, if any. */
      getActiveForParticipant(participantId: string) {
        return prisma.invite.findFirst({
          where: {
            organizationId,
            participantId,
            kind: "PARTICIPANT_CLAIM",
            acceptedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
        });
      },
      async create(input: { participantId: string; eventId?: string }) {
        const participant = await prisma.participant.findFirst({
          where: { id: input.participantId, organizationId },
          select: { id: true, email: true },
        });
        if (!participant) throw new Error("Participant not found in this organization");

        const invite = await prisma.invite.create({
          data: {
            organizationId,
            participantId: input.participantId,
            eventId: input.eventId ?? null,
            email: participant.email,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
        });

        await recordAudit({
          organizationId,
          actorUserId,
          action: "invite.create",
          entityType: "Invite",
          entityId: invite.id,
          metadata: { participantId: input.participantId, eventId: input.eventId ?? null },
        });

        return invite;
      },
      /** Record where the invite was emailed. */
      markEmailed(inviteId: string, email: string) {
        return prisma.invite.updateMany({
          where: { id: inviteId, organizationId },
          data: { email },
        });
      },
    },

    // --- Event photos (binaries in R2, metadata here) --------------------------
    photos: {
      listForEvent(eventId: string) {
        return prisma.photo.findMany({
          where: { organizationId, eventId },
          orderBy: { createdAt: "desc" },
        });
      },
      async create(input: {
        eventId: string;
        storageKey: string;
        thumbKey?: string;
        contentType: string;
        size: number;
        caption?: string;
      }) {
        const event = await prisma.event.findFirst({
          where: { id: input.eventId, organizationId },
          select: { id: true },
        });
        if (!event) throw new Error("Event not found in this organization");

        return prisma.photo.create({
          data: {
            organizationId,
            eventId: input.eventId,
            storageKey: input.storageKey,
            thumbKey: input.thumbKey ?? null,
            contentType: input.contentType,
            size: input.size,
            caption: input.caption ?? null,
            uploadedByUserId: actorUserId ?? null,
          },
        });
      },
      /** Removes the DB row; caller is responsible for deleting the R2 object. */
      async delete(photoId: string) {
        const photo = await prisma.photo.findFirst({
          where: { id: photoId, organizationId },
        });
        if (!photo) return null;
        await prisma.photo.delete({ where: { id: photo.id } });
        return photo;
      },
    },

    // --- Program / client tracker ----------------------------------------------
    programs: {
      list() {
        return prisma.program.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { stages: true, enrollments: true } },
          },
        });
      },
      get(id: string) {
        return prisma.program.findFirst({
          where: { id, organizationId },
          include: {
            stages: {
              orderBy: { order: "asc" },
              include: {
                requiredForm: { select: { id: true, name: true } },
                _count: { select: { events: true } },
              },
            },
          },
        });
      },
      async create(data: { name: string; description?: string }) {
        await assertWithinLimit(organizationId, "programs");
        return prisma.program.create({
          data: {
            organizationId,
            name: data.name,
            description: data.description ?? null,
          },
        });
      },
      rename(id: string, name: string) {
        return prisma.program.updateMany({
          where: { id, organizationId },
          data: { name },
        });
      },
      setAdvanceMode(id: string, advanceMode: "MANUAL" | "AUTO") {
        return prisma.program.updateMany({
          where: { id, organizationId },
          data: { advanceMode },
        });
      },
      /** Deletes the program, its stages, enrollments, and completions.
       *  Participants and their event/health data are untouched; linked
       *  events just lose their stage link. */
      delete(id: string) {
        return prisma.program.deleteMany({ where: { id, organizationId } });
      },
      /** Every stage in the org with its program name (for link pickers). */
      listAllStages() {
        return prisma.stage.findMany({
          where: { organizationId },
          orderBy: [{ programId: "asc" }, { order: "asc" }],
          include: { program: { select: { name: true } } },
        });
      },
      async addStage(programId: string, name: string) {
        const program = await prisma.program.findFirst({
          where: { id: programId, organizationId },
          select: { id: true },
        });
        if (!program) throw new Error("Program not found in this organization");
        const last = await prisma.stage.findFirst({
          where: { programId },
          orderBy: { order: "desc" },
          select: { order: true },
        });
        return prisma.stage.create({
          data: {
            organizationId,
            programId,
            name,
            order: (last?.order ?? 0) + 1,
          },
        });
      },
      removeStage(stageId: string) {
        return prisma.stage.deleteMany({ where: { id: stageId, organizationId } });
      },
      /** Swap a stage with its neighbor (direction -1 = up, +1 = down). */
      async moveStage(stageId: string, direction: -1 | 1) {
        const stage = await prisma.stage.findFirst({
          where: { id: stageId, organizationId },
          select: { id: true, programId: true, order: true },
        });
        if (!stage) return;
        const neighbor = await prisma.stage.findFirst({
          where: {
            programId: stage.programId,
            order: direction === -1 ? { lt: stage.order } : { gt: stage.order },
          },
          orderBy: { order: direction === -1 ? "desc" : "asc" },
          select: { id: true, order: true },
        });
        if (!neighbor) return;
        await prisma.$transaction([
          prisma.stage.update({
            where: { id: stage.id },
            data: { order: neighbor.order },
          }),
          prisma.stage.update({
            where: { id: neighbor.id },
            data: { order: stage.order },
          }),
        ]);
      },
      async setStageRequiredForm(stageId: string, formTemplateId: string | null) {
        if (formTemplateId) {
          const form = await prisma.formTemplate.findFirst({
            where: { id: formTemplateId, organizationId },
            select: { id: true },
          });
          if (!form) throw new Error("Form not found in this organization");
        }
        return prisma.stage.updateMany({
          where: { id: stageId, organizationId },
          data: { requiredFormTemplateId: formTemplateId },
        });
      },
    },

    enrollments: {
      /**
       * Program roster with per-enrollment readiness: an enrollment is "ready"
       * when its current stage HAS requirements (linked events / a form) and
       * all of them are satisfied. No requirements → host judgment, no flag.
       */
      async listForProgram(programId: string) {
        const program = await prisma.program.findFirst({
          where: { id: programId, organizationId },
          select: { advanceMode: true },
        });

        const fetch = () =>
          prisma.programEnrollment.findMany({
            where: { organizationId, programId },
            orderBy: { enrolledAt: "asc" },
            include: {
              participant: {
                select: { id: true, firstName: true, lastName: true },
              },
              currentStage: {
                include: {
                  events: { select: { id: true } },
                  requiredForm: { select: { id: true, name: true } },
                },
              },
              completions: { select: { stageId: true } },
            },
          });

        let enrollments = await fetch();

        // AUTO mode: advance every enrollment whose requirements are met,
        // chaining through multiple stages if needed (applied lazily on load).
        if (program?.advanceMode === "AUTO") {
          let anyAdvanced = false;
          for (const e of enrollments) {
            let current = e;
            for (let guard = 0; guard < 25; guard++) {
              if (current.status !== "ACTIVE" || !current.currentStage) break;
              const met = await meetsStageRequirements(
                organizationId,
                current.participantId,
                current.currentStage,
              );
              if (met !== true) break; // false OR no-requirements → host decides
              await advanceEnrollment(organizationId, current.id);
              anyAdvanced = true;
              const reloaded = await prisma.programEnrollment.findFirst({
                where: { id: current.id },
                include: {
                  participant: { select: { id: true, firstName: true, lastName: true } },
                  currentStage: {
                    include: {
                      events: { select: { id: true } },
                      requiredForm: { select: { id: true, name: true } },
                    },
                  },
                  completions: { select: { stageId: true } },
                },
              });
              if (!reloaded) break;
              current = reloaded;
            }
          }
          if (anyAdvanced) enrollments = await fetch();
        }

        return Promise.all(
          enrollments.map(async (e) => {
            let ready = false;
            if (e.status === "ACTIVE" && e.currentStage) {
              ready =
                (await meetsStageRequirements(
                  organizationId,
                  e.participantId,
                  e.currentStage,
                )) === true;
            }
            return { ...e, ready };
          }),
        );
      },

      async enroll(programId: string, participantId: string) {
        const [program, participant, firstStage] = await Promise.all([
          prisma.program.findFirst({
            where: { id: programId, organizationId },
            select: { id: true },
          }),
          prisma.participant.findFirst({
            where: { id: participantId, organizationId },
            select: { id: true },
          }),
          prisma.stage.findFirst({
            where: { programId, organizationId },
            orderBy: { order: "asc" },
            select: { id: true },
          }),
        ]);
        if (!program) throw new Error("Program not found in this organization");
        if (!participant) throw new Error("Participant not found in this organization");

        return prisma.programEnrollment.upsert({
          where: { programId_participantId: { programId, participantId } },
          create: {
            organizationId,
            programId,
            participantId,
            currentStageId: firstStage?.id ?? null,
          },
          update: {}, // enrolling twice is a no-op
        });
      },

      /** Complete the current stage and move to the next (or finish the program). */
      advance(enrollmentId: string) {
        return advanceEnrollment(organizationId, enrollmentId);
      },

      /** Wipe progress: clear completions, back to the first stage, ACTIVE. */
      async reset(enrollmentId: string) {
        const enrollment = await prisma.programEnrollment.findFirst({
          where: { id: enrollmentId, organizationId },
          select: { id: true, programId: true },
        });
        if (!enrollment) return;
        const firstStage = await prisma.stage.findFirst({
          where: { programId: enrollment.programId },
          orderBy: { order: "asc" },
          select: { id: true },
        });
        await prisma.$transaction([
          prisma.stageCompletion.deleteMany({
            where: { enrollmentId, organizationId },
          }),
          prisma.programEnrollment.update({
            where: { id: enrollmentId },
            data: { currentStageId: firstStage?.id ?? null, status: "ACTIVE" },
          }),
        ]);
      },

      /** Remove the enrollment entirely (completions cascade). The participant
       *  record and all their event/health data are untouched. */
      remove(enrollmentId: string) {
        return prisma.programEnrollment.deleteMany({
          where: { id: enrollmentId, organizationId },
        });
      },

      /** Host override: place the enrollment at any stage. */
      async moveTo(enrollmentId: string, stageId: string) {
        const [enrollment, stage] = await Promise.all([
          prisma.programEnrollment.findFirst({
            where: { id: enrollmentId, organizationId },
            select: { id: true, programId: true },
          }),
          prisma.stage.findFirst({
            where: { id: stageId, organizationId },
            select: { id: true, programId: true },
          }),
        ]);
        if (!enrollment || !stage || enrollment.programId !== stage.programId) {
          throw new Error("Stage not in this enrollment's program");
        }
        return prisma.programEnrollment.update({
          where: { id: enrollmentId },
          data: { currentStageId: stageId, status: "ACTIVE" },
        });
      },

      setStatus(
        enrollmentId: string,
        status: "ACTIVE" | "COMPLETED" | "PAUSED" | "DROPPED",
      ) {
        return prisma.programEnrollment.updateMany({
          where: { id: enrollmentId, organizationId },
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
