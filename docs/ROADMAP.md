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
- **2a (done ✅):** Form builder (5 question types, versioned publish), attach a
  form per event, public **self-registration** page (`/r/[eventId]`) with intake,
  participant detail page (BP history + intake answers), host fill (re-filing
  records a new submission — history preserved).
- **2b (done ✅):** **Invite links** — personal tokenized `/i/[token]` links per
  participant (30-day expiry, single-use, audit-logged). Copyable always;
  emailed via Resend when `RESEND_API_KEY` is set. Invitee confirms contact
  info + fills the event's intake form.
- **Demo:** publish a form, attach to an event, register via the public link,
  view answers on the participant page.

### Phase 3 — Participant portal *(done ✅)*
- Claiming = **verified-email match**: magic-link sign-in proves email
  ownership; unclaimed participant records with that email auto-link
  (`Participant.userId`) on portal visit. Token-based claiming can harden this
  later if needed.
- `/me` portal grouped by organization: my events (+status), BP history, intake
  answers. Portal reads of health data are audit-logged like host reads.
- CTAs: invite-accepted and registration-done pages → "See my data" →
  `/sign-in?to=me`; dashboard ↔ portal cross-links.
- **Demo:** accept an invite (or register) with your email, sign in, see your
  own history at `/me`.

### Phase 4 — Photos *(done ✅ — needs R2 env vars to activate)*
- Cloudflare R2 storage (private bucket, presigned GET display, uploads proxied
  through the app so no bucket CORS setup).
- Host: per-event gallery — multi-file upload, hover-delete. Participant portal
  shows photos under each attended event (PRIVATE ones never leave the host view).
- Visibility enum exists (PUBLIC/PARTICIPANTS/PRIVATE, default PARTICIPANTS);
  per-photo toggle UI is a later nicety.
- **Demo:** upload event photos, participant sees them at /me.

### Phase 5 — Program / client tracker  ✅ done
- Programs → ordered Stages (add/reorder/remove; per-stage required form).
- Events link to a stage; attendance (check-in **or a BP reading at the event**)
  + form submission satisfy requirements → **"Ready ✓"** flag; host confirms
  advance (linear with override: move anyone to any stage, pause/drop/resume).
- Roster view with stage badges + per-stage progress dots; enroll from org
  participants; StageCompletion history.
- **Demo:** 3-stage program, link an event, take a BP there, watch Ready ✓,
  advance to completion 🎉.
- *Management polish (done ✅):* offline-capable **check-in button** on the event
  roster; per-program **advance mode** (Manual / Automatic — auto applies lazily
  when the roster loads); enrollment **reset** (wipe progress) and **remove**
  (delete enrollment, participant data untouched); **rename + delete** for
  programs, forms, events, and organizations with dependency-aware warnings
  (form delete blocked when submissions exist → archive; event delete keeps
  readings/submissions; org delete is OWNER-only with typed-name confirm and
  cleans R2 binaries).
- *Later polish:* program progress on the participant portal (`/me`); kanban
  board view; BP trend chart.

### Phase 6 — Billing seam activated
- Stripe subscriptions; Plans with limits; enforce limits from the plan.
- **Demo:** subscribe an org to a paid plan.

### Phase 7 — Ecosystem integration
- Public API + auth (API keys / OAuth) for external products.
- **Site Generator** (separate repo) embeds/links Vitalgather intake forms + event registration.
- (Much later) domain reselling via a registrar reseller API.

---

## Future considerations (decided 2026-07-06, not yet scheduled)
- **Auth:** ADD Google OAuth alongside magic links (not a switch) once participant
  sign-ups come from strangers; magic link stays as universal fallback + claim
  mechanism. Never add passwords.
- **Payments are two systems:** (a) SaaS billing = hosts pay us — Phase 6, Stripe,
  behind a thin provider seam (our Plan/Subscription tables stay source of truth;
  provider IDs + webhooks are the only integration surface, so PayPal etc. can be
  adapters later). (b) Participant→host payments = later marketplace phase on
  Stripe **Connect**; BNPL/split payments (Affirm/Klarna/Afterpay) come as Stripe
  payment methods, no direct Affirm integration needed.
- **Program contracts:** when requested, ship an "Agreement" question type in the
  form builder (host-supplied waiver text/PDF link + required checkbox; acceptance
  stored w/ timestamp + form version + audit). Full e-sign (DocuSign etc.) only on
  real demand. Vitalgather records assent; hosts own their legal text.
- **Event-discovery hub (Meetup-like):** public searchable index over opted-in
  events. Prereqs: categories/tags, geo location fields, org public profiles, SEO
  listing pages. Sequence AFTER billing + public API + site generator (those feed
  it hosts). No rewrite needed — layers on existing public event pages.

## Operational TODOs (not code phases)
- [x] Domain wired end-to-end (2026-07-07): app on https://vitalgather.com (Railway
      custom domain, port 8080, Cloudflare DNS-only CNAME), vitalgather.app 301→.com,
      Resend domain verified, `EMAIL_FROM=Vitalgather <signin@vitalgather.com>`,
      `AUTH_URL=https://vitalgather.com`. Emails now deliver to ANY address.
- [x] `RESEND_API_KEY` set on Railway.
- [x] Renamed to **Vitalgather** (2026-07-06). Register vitalgather.com + .app, then wire domain (Railway custom domain, Resend verification, AUTH_URL/EMAIL_FROM).

## Suggested near-term focus
**Phases 0 → 1** get you the single most valuable, demoable loop: run a real event and capture BP on your phone, offline. Everything after that is additive. I'd treat 0+1 as the first milestone before touching forms.
