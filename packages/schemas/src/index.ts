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
  systolic: z.coerce.number().int().min(40).max(300),
  diastolic: z.coerce.number().int().min(20).max(200),
  pulse: z.coerce.number().int().min(20).max(250).optional(),
  note: z.string().max(2000).optional(),
});
export type CreateHealthReadingInput = z.infer<typeof createHealthReadingSchema>;
