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

// --- Timezones (events are anchored to a venue zone) --------------------------

/** True for a real IANA timezone (e.g. "America/Denver"). */
export function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const timezoneSchema = z.string().refine(isValidTimeZone, "Invalid timezone");
// Wall-clock value from a datetime-local input (yyyy-MM-ddThh:mm), interpreted
// in the event's timezone by the caller.
const wallClockSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Invalid date/time");

// --- Custom intake forms (Phase 2) --------------------------------------------

export const formQuestionTypeSchema = z.enum([
  "text",
  "textarea",
  "number",
  "select", // dropdown, single choice
  "radio", // multiple choice, single select
  "checkboxes", // multiple choice, select any
  "checkbox", // single Yes/No toggle
  "agreement", // terms/waiver the participant must accept
]);
export type FormQuestionType = z.infer<typeof formQuestionTypeSchema>;

/** Types that carry an options list. */
export const OPTION_TYPES = ["select", "radio", "checkboxes"] as const;

export const formQuestionSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(200),
  type: formQuestionTypeSchema,
  required: z.boolean().default(false),
  options: z.array(z.string().min(1).max(100)).max(20).optional(), // for "select"
  // Agreement type only:
  agreementText: z.string().max(20000).optional(), // host-pasted terms
  documentKey: z.string().max(300).optional(), // R2 key of an uploaded PDF/image
  documentName: z.string().max(200).optional(), // original filename, for display
});
export type FormQuestion = z.infer<typeof formQuestionSchema>;

export const createAgreementSchema = z.object({
  label: z.string().min(2, "Give the agreement a title").max(200),
  agreementText: z.string().max(20000).optional(),
  documentKey: z.string().max(300).optional(),
  documentName: z.string().max(200).optional(),
});
export type CreateAgreementInput = z.infer<typeof createAgreementSchema>;

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

export const renameSchema = z.object({
  name: z.string().min(2, "Name is too short").max(140),
});
export type RenameInput = z.infer<typeof renameSchema>;

export const updateEventSchema = z.object({
  title: z.string().min(2, "Title is too short").max(140),
  description: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
  startsAt: wallClockSchema,
  timezone: timezoneSchema,
});
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/** Mode A payment settings — price in dollars, converted to cents server-side. */
export const paymentSettingsSchema = z.object({
  price: z.coerce
    .number()
    .min(0)
    .max(100000)
    .optional(), // absent/0 = free event
  paymentLink: z
    .string()
    .url("Payment link must be a full URL (https://…)")
    .max(500)
    .optional()
    .or(z.literal("")),
  paymentInstructions: z.string().max(500).optional(),
});
export type PaymentSettingsInput = z.infer<typeof paymentSettingsSchema>;

export const advanceModeSchema = z.enum(["MANUAL", "AUTO"]);

/** Event discoverability — see EventVisibility in the Prisma schema. */
export const eventVisibilitySchema = z.enum(["CLOSED", "UNLISTED", "LISTED"]);
export type EventVisibilityInput = z.infer<typeof eventVisibilitySchema>;

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

export const checkinOpSchema = z.object({
  kind: z.literal("checkin"),
  id: z.string().uuid(),
  eventId: z.string().min(1),
  participantId: z.string().min(1),
});

export const paidOpSchema = z.object({
  kind: z.literal("paid"),
  id: z.string().uuid(),
  eventId: z.string().min(1),
  participantId: z.string().min(1),
  paid: z.boolean(),
});

export const syncOpSchema = z.discriminatedUnion("kind", [
  participantOpSchema,
  readingOpSchema,
  checkinOpSchema,
  paidOpSchema,
]);
export type SyncOp = z.infer<typeof syncOpSchema>;

export const syncBatchSchema = z.object({
  ops: z.array(syncOpSchema).min(1).max(200),
});
export type SyncBatch = z.infer<typeof syncBatchSchema>;

export const createEventSchema = z.object({
  title: z.string().min(2, "Title is too short").max(140),
  location: z.string().max(200).optional(),
  startsAt: wallClockSchema,
  timezone: timezoneSchema,
});
export type CreateEventInput = z.infer<typeof createEventSchema>;
