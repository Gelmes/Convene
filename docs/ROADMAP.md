# Roadmap — phased build

You chose to build everything, in phases. Each phase is shippable and demoable on its own. Health-data isolation, multi-tenancy, and the billing seam are established in Phase 0 so nothing expensive gets retrofitted.

---

### Phase 0 — Foundation *(the plumbing)*
- Turborepo + pnpm monorepo; Next.js `apps/web`; `packages/db|schemas|auth|core|ui`.
- Postgres on Railway; Prisma schema for **Organization, User, Membership, Participant, AuditLog**.
- Auth.js: sign up / sign in (magic link), create org, org-scoped data-access layer.
- Health-data seam: `HealthReading` table, encryption util (no-op), audit-log helper.
- Deploy to Railway (web + Postgres).
- **Demo:** create an account, create an org, invite a teammate.

### Phase 1 — Core capture *(the heartbeat)*
- **1a (done ✅):** Events CRUD, add participants **on the spot**, mobile-first
  **field capture** (pick participant → BP + note → save), roster per event with
  latest reading. Live on Railway.
- **1b (done ✅):** **PWA + offline** — service worker caches visited pages,
  IndexedDB outbox with idempotent batch sync (`/api/o/[orgId]/sync`),
  online/offline + pending-sync indicators, offline-correct `takenAt` timestamps.
- **Demo:** open an event on your phone, go airplane mode, add a participant and
  record BPs, come back online — everything syncs.

### Phase 2 — Custom intake forms
- Form builder (custom questions → versioned JSON schema).
- Public **self-registration** link per event (fills intake).
- **Invite links**: "add participant + send link" to claim/complete intake.
- Host can fill/edit a participant's intake.
- **Demo:** publish a form, register via public link, host edits an answer.

### Phase 3 — Participant portal
- Participant accounts **claim** their org-owned record via invite/registration.
- Portal: my BP readings over time, events I attended, my intake answers.
- **Demo:** participant logs in and sees their own history.

### Phase 4 — Photos
- Cloudflare R2 storage; per-event gallery upload (host).
- Participant portal shows photos from events they attended; visibility controls.
- **Demo:** upload event photos, participant sees them.

### Phase 5 — Program / client tracker
- Programs → Stages (configurable count per program).
- Enroll participants; track StageProgress; optionally link events to stages.
- Host dashboard: "who is at which stage across which program."
- **Demo:** define a 3-stage program, move a participant through it.

### Phase 6 — Billing seam activated
- Stripe subscriptions; Plans with limits; enforce limits from the plan.
- **Demo:** subscribe an org to a paid plan.

### Phase 7 — Ecosystem integration
- Public API + auth (API keys / OAuth) for external products.
- **Site Generator** (separate repo) embeds/links Convene intake forms + event registration.
- (Much later) domain reselling via a registrar reseller API.

---

## Operational TODOs (not code phases)
- [ ] **Verify a domain in Resend** once the product domain is bought. Until then the
      free `onboarding@resend.dev` sender only delivers to the Resend account owner's
      email (marco.firsteye@gmail.com) — participants/other hosts can't receive
      magic links. Steps: Resend → Domains → Add domain → set the DNS records →
      change `EMAIL_FROM` to e.g. `Convene <signin@yourdomain.com>`.
- [ ] Set `RESEND_API_KEY` on Railway (magic links currently print to deploy logs).
- [ ] Rename the product (Convene is a placeholder) before public assets.

## Suggested near-term focus
**Phases 0 → 1** get you the single most valuable, demoable loop: run a real event and capture BP on your phone, offline. Everything after that is additive. I'd treat 0+1 as the first milestone before touching forms.
