# Data model

Conceptual model (not final Prisma yet). Every **tenant-scoped** table carries `organizationId`. IDs are `cuid`/`uuid`. Timestamps (`createdAt`, `updatedAt`) on everything; omitted below for brevity.

## Core (Phases 0–3)

### Organization  *(the tenant)*
`id, name, slug, planId?(→ billing seam), settings(json)`
A host/facilitator's business. Root of all tenant data.

### User  *(auth identity)*
`id, email, name, passwordHash?, emailVerifiedAt`
Can be host-side (via Membership) and/or linked to a Participant.

### Membership  *(User ↔ Organization)*
`id, userId, organizationId, role(OWNER|ADMIN|FACILITATOR|STAFF), status`
Grants host-side access to an org.

### Participant  *(org-owned record; account optional)*
`id, organizationId, userId?(nullable → claimed later), firstName, lastName, email?, phone?, dateOfBirth?, consentAt?, notes?`
Exists without a User (host-added on the spot). Gets linked to a User when claimed via invite/registration.

### Event
`id, organizationId, title, description?, startsAt, endsAt?, location?, capacity?, publicRegistration(bool)`

### EventRegistration  *(Participant ↔ Event)*
`id, organizationId, eventId, participantId, status(REGISTERED|CHECKED_IN|ATTENDED|NO_SHOW), source(SELF|HOST_ADDED|INVITE), registeredAt`

### HealthReading  *(isolated, audited, encryptable)*  ⚠️ sensitive
`id, organizationId, participantId, eventId?, systolic, diastolic, pulse?, note?, takenByUserId, takenAt`
Append-only. Never inlined into Participant/Event. Every access writes an AuditLog row. Field-encryption seam wraps `systolic/diastolic/pulse/note` (no-op in wellness mode).

### Invite
`id, organizationId, email, token, kind(PARTICIPANT_CLAIM|STAFF), participantId?, role?, expiresAt, acceptedAt?`
Powers "add participant + send link" and staff invites.

### AuditLog
`id, organizationId, actorUserId?, action, entityType, entityId, metadata(json), createdAt`
Written for all health-data reads/writes/edits (and other sensitive actions).

## Custom intake forms (Phase 2)

### FormTemplate
`id, organizationId, name, description?, version, status(DRAFT|PUBLISHED), schema(json)`
Custom questions live as a versioned JSON schema (question id, label, type, required, options, validation). Versioned so past submissions stay interpretable.

### FormAssignment  *(optional)*
`id, organizationId, formTemplateId, eventId?`
Attach a form to an event (or org-wide default).

### FormSubmission
`id, organizationId, formTemplateId, formTemplateVersion, participantId, submittedByUserId?, filledBy(PARTICIPANT|HOST), answers(json), submittedAt`
Either the participant or a host can fill/edit. `filledBy` + audit captures who.

## Program / Client tracker (Phase 5) — flexible pipelines

Designed for "multiple programs, each with a different number of stages/levels."

### Program
`id, organizationId, name, description?, status`

### Stage  *(ordered steps within a program)*
`id, organizationId, programId, name, order, config(json)`
A program has N stages; N is per-program. Rename "stage" → "level"/"step" freely in UI.

### ProgramEnrollment  *(Participant ↔ Program)*
`id, organizationId, programId, participantId, status(ACTIVE|COMPLETED|PAUSED|DROPPED), enrolledAt`

### StageProgress  *(Enrollment ↔ Stage)*
`id, organizationId, enrollmentId, stageId, status(NOT_STARTED|IN_PROGRESS|DONE), enteredAt?, completedAt?`
Tracks where each participant is. Events can optionally reference a `stageId` to mark "this event advances stage X."

## Photos (Phase 4)

### Photo
`id, organizationId, eventId, storageKey(R2), caption?, visibility(PUBLIC|PARTICIPANTS|PRIVATE), uploadedByUserId, takenAt?`
Binary in Cloudflare R2; only metadata in Postgres. Participant portal shows photos from events they attended.

## Billing seam (Phase 6, stubbed from Phase 0)

### Plan / Subscription
`Plan(id, name, limits(json))`, `Subscription(id, organizationId, planId, stripeCustomerId?, stripeSubscriptionId?, status)`
`Organization.planId` exists from the start (nullable). Stripe fields wired only when billing activates. Limits (e.g. max events/participants) enforced by reading the plan — free-forever until we flip it on.

## Entity map (text)

```
Organization 1─* Membership *─1 User
Organization 1─* Participant 0..1─1 User (claimed)
Organization 1─* Event 1─* EventRegistration *─1 Participant
Participant 1─* HealthReading  (eventId optional)
Organization 1─* FormTemplate 1─* FormSubmission *─1 Participant
Organization 1─* Program 1─* Stage
Program 1─* ProgramEnrollment *─1 Participant 1─* StageProgress *─1 Stage
Event 1─* Photo
Organization 1─* Invite / AuditLog / Subscription
```
