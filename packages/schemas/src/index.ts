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
