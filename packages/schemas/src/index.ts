import { z } from "zod";

/** Shared validation schemas — one source of truth for API, forms and DB writes. */

export const emailSchema = z.string().email();

export const signInSchema = z.object({
  email: emailSchema,
});
export type SignInInput = z.infer<typeof signInSchema>;

export const createOrganizationSchema = z.object({
  name: z.string().min(2, "Name is too short").max(100),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const createParticipantSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(80),
  lastName: z.string().max(80).optional(),
  email: emailSchema.optional(),
  phone: z.string().max(40).optional(),
});
export type CreateParticipantInput = z.infer<typeof createParticipantSchema>;

export const createHealthReadingSchema = z.object({
  participantId: z.string().min(1),
  eventId: z.string().min(1).optional(),
  systolic: z.coerce.number().int().min(40).max(300),
  diastolic: z.coerce.number().int().min(20).max(200),
  pulse: z.coerce.number().int().min(20).max(250).optional(),
  note: z.string().max(2000).optional(),
});
export type CreateHealthReadingInput = z.infer<typeof createHealthReadingSchema>;

// --- Custom intake forms (Phase 2) --------------------------------------------

export const formQuestionTypeSchema = z.enum([
  "text",
  "textarea",
  "number",
  "select",
  "checkbox",
]);
export type FormQuestionType = z.infer<typeof formQuestionTypeSchema>;

export const formQuestionSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(200),
  type: formQuestionTypeSchema,
  required: z.boolean().default(false),
  options: z.array(z.string().min(1).max(100)).max(20).optional(), // for "select"
});
export type FormQuestion = z.infer<typeof formQuestionSchema>;

export const formQuestionsSchema = z.array(formQuestionSchema).max(50);

export const createFormTemplateSchema = z.object({
  name: z.string().min(2, "Name is too short").max(120),
  description: z.string().max(500).optional(),
});
export type CreateFormTemplateInput = z.infer<typeof createFormTemplateSchema>;

/** Answers are self-describing so old submissions survive form edits. */
export const formAnswerSchema = z.object({
  questionId: z.string(),
  label: z.string().max(200),
  value: z.string().max(4000),
});
export type FormAnswer = z.infer<typeof formAnswerSchema>;
export const formAnswersSchema = z.array(formAnswerSchema).max(50);

export const publicRegistrationSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(80),
  lastName: z.string().max(80).optional(),
  email: emailSchema.optional(),
  answers: formAnswersSchema.optional(),
});
export type PublicRegistrationInput = z.infer<typeof publicRegistrationSchema>;

// --- Program tracker (Phase 5) ------------------------------------------------

export const createProgramSchema = z.object({
  name: z.string().min(2, "Name is too short").max(120),
  description: z.string().max(500).optional(),
});
export type CreateProgramInput = z.infer<typeof createProgramSchema>;

export const createStageSchema = z.object({
  name: z.string().min(1, "Stage name is required").max(120),
});
export type CreateStageInput = z.infer<typeof createStageSchema>;

export const acceptInviteSchema = z.object({
  email: emailSchema.optional(),
  phone: z.string().max(30).optional(),
  answers: formAnswersSchema.optional(),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

// --- Offline sync (Phase 1b) -------------------------------------------------
// Ops are created on the device with client-generated UUIDs so the server can
// apply them idempotently — a retried batch never duplicates data.

export const participantOpSchema = z.object({
  kind: z.literal("participant"),
  id: z.string().uuid(),
  eventId: z.string().min(1),
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).optional(),
});

export const readingOpSchema = z.object({
  kind: z.literal("reading"),
  id: z.string().uuid(),
  eventId: z.string().min(1),
  participantId: z.string().min(1),
  systolic: z.coerce.number().int().min(40).max(300),
  diastolic: z.coerce.number().int().min(20).max(200),
  pulse: z.coerce.number().int().min(20).max(250).optional(),
  note: z.string().max(2000).optional(),
  takenAt: z.coerce.date(), // captured at entry time, not sync time
});

export const syncOpSchema = z.discriminatedUnion("kind", [
  participantOpSchema,
  readingOpSchema,
]);
export type SyncOp = z.infer<typeof syncOpSchema>;

export const syncBatchSchema = z.object({
  ops: z.array(syncOpSchema).min(1).max(200),
});
export type SyncBatch = z.infer<typeof syncBatchSchema>;

export const createEventSchema = z.object({
  title: z.string().min(2, "Title is too short").max(140),
  description: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;
