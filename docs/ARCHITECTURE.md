# Architecture

## Guiding principles

1. **Ship fast, solo.** One language front-to-back, conventional stack with lots of AI training data, minimal moving parts.
2. **Small now, clean seams to grow.** No premature scaling, but every boundary that's expensive to add later (multi-tenancy, health-data isolation, billing) is stubbed from day one.
3. **Decoupled products.** Host Manager, Program Tracker (a module), and Site Generator (separate repo) integrate over APIs, never shared internals.
4. **Health data is special.** Treated as sensitive from the first commit so we can harden to clinical/HIPAA-grade without a rewrite.

## Recommended stack

| Layer | Choice | Why |
|---|---|---|
| **Monorepo** | Turborepo + pnpm workspaces | Shared types/validation between web, API, and future site-generator client. |
| **Web + API** | **Next.js** (App Router) | One codebase serves the PWA *and* the API (Route Handlers / Server Actions). Huge AI training corpus. |
| **PWA / offline** | Manifest + service worker, **Dexie** (IndexedDB) + a sync queue | Field capture works with no signal; queued readings sync when back online. |
| **Database** | **PostgreSQL** on Railway | Relational data (orgs, events, participants, readings) fits SQL perfectly. |
| **ORM** | **Prisma** | Type-safe, first-class migrations, excellent AI support. |
| **Auth** | **Auth.js (NextAuth)** — email magic links + optional password | Free, self-hosted on Railway, supports invites and both host + participant identities. (Clerk is the paid fast-path alternative.) |
| **Validation** | **Zod** (shared schemas package) | One schema drives DB, API, and form validation. |
| **UI** | **Tailwind + shadcn/ui** | Fast, accessible, mobile-first, AI-friendly. |
| **Email** | **Resend** | Magic links, invite links, notifications. |
| **File storage** (Phase 4) | **Cloudflare R2** (S3-compatible) | Cheap egress for event photos; Railway has no blob store. |
| **Billing** (deferred) | **Stripe** | Wired only when we activate the billing seam. |
| **Hosting** | **Railway** | Web service + managed Postgres + cron. Your stated preference. |

### Why not a separate native app?
You chose a **PWA**. One codebase (Next.js) serves web and installs to a phone home screen, works offline, and needs no app-store review. If device limits ever bite (e.g. Bluetooth BP cuffs), we can wrap the same app in **Capacitor** later without rewriting.

## Multi-tenancy

- **Tenant = Organization** (a host/facilitator's business). One host can own an org; staff join via membership.
- **Single Postgres, shared schema, row-level isolation.** Every tenant-scoped table carries `organizationId`. All queries are scoped to the caller's org in the data-access layer.
- **Enforcement:** a thin repository/data-access layer that *always* injects `organizationId` — no raw queries in feature code. Optionally add Postgres **Row-Level Security** later for defense-in-depth (a clean seam, not built now).
- This is the small→medium growth path: no schema-per-tenant complexity until we actually need it.

## Roles & identity

- A **User** is an auth identity. A user can be host-side (via a Membership with a role) and/or a participant.
- **Membership** links a User to an Organization with a role: `OWNER`, `ADMIN`, `FACILITATOR`, `STAFF`.
- A **Participant** is a *record owned by an org*, and may or may not be linked to a User account. This is the key to "add on the spot": the host creates a Participant with no account; the participant later **claims** it via an invite/registration link, which links a User to that Participant record.

## Onboarding flows (both supported)

1. **Self-register:** public per-event link → participant creates account + fills intake → appears in host's roster as `registered`.
2. **Host-added:** host creates a Participant on the spot (name + BP, no account) → optionally "send link" → participant receives an invite → claims the record → account now linked.

## Field capture (the core loop)

Mobile-first screen: pick/scan a participant → enter systolic/diastolic/pulse + a quick note → save. Optimized for one-handed, few-taps, works offline:

- Reads/writes go to **IndexedDB (Dexie)** first for instant response.
- A **sync queue** flushes to the API when online; conflicts resolved last-write-wins per reading (readings are append-only, so conflicts are rare).
- Each reading records `takenByUserId` and `takenAt` for the audit trail.

## Security & health-data model (design-for-clinical-later)

Even at wellness grade, we bake in the expensive-to-retrofit pieces:

- **Isolation:** health readings live in a dedicated `HealthReading` table, never inlined into participant/event rows. Makes future encryption, stricter access control, and export/delete trivial.
- **Field-level encryption seam:** a `crypto` util wraps sensitive fields; wellness mode can no-op, clinical mode enables app-level encryption + a managed key — no schema change.
- **Audit logging:** every read/write/edit of health data writes an `AuditLog` row (who, what, when, which participant). Required for any future clinical posture.
- **Access control:** health data access is gated by org membership + role, checked in the data-access layer.
- **Consent:** intake forms capture consent; a `consentAt` timestamp lives on the participant/registration.

## Monorepo layout (target)

```
convene/
├─ apps/
│  └─ web/                # Next.js: PWA + API route handlers + server actions
├─ packages/
│  ├─ db/                 # Prisma schema, migrations, client, data-access layer
│  ├─ schemas/            # Zod schemas shared across web/API/forms
│  ├─ auth/               # Auth.js config, session/role helpers
│  ├─ core/               # Domain logic (health readings, forms, programs)
│  └─ ui/                 # shadcn/ui components shared across apps
├─ docs/                  # This architecture (current phase)
└─ turbo.json / pnpm-workspace.yaml
```

The **Site Generator** is a *separate repo*; it consumes Convene's public API (embed intake form, deep-link event registration). Domain reselling (much later) goes through a registrar reseller API (e.g. Namecheap / OpenSRS / Enom) — not a page-host like HostGator.

## Deployment (Railway)

- **web** service (Next.js) + **Postgres** plugin + **cron** for scheduled jobs (invite expiry, digests).
- Env-driven config; secrets in Railway. R2 + Resend + (later) Stripe keys as env vars.
- Preview deploys per branch once we start building.
