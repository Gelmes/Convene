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

### Phase 6 — Billing seam activated ✅ done
- Free + Pro ($29/mo, $290/yr). Plan/Subscription tables are the source of
  truth (limits in `Plan.limits` JSON, seeded in the migration, adjustable via
  SQL); Stripe reached only via checkout/portal sessions + signature-verified
  webhooks (`/api/billing/webhook`), all provider ids behind a `provider` field.
- Inline `price_data` checkout → zero Stripe dashboard product setup; only
  `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` env vars.
- Free limits (3 events / 50 participants / 1 program / 3 forms) enforced in
  the tenant layer + public registration; friendly upgrade banners on limit,
  "Registration is full" on public page, sync-error surfacing in field capture.
- Org page billing card: plan badge, usage meters, Go Pro (monthly/yearly),
  Stripe customer portal for invoices/cancel.
- **Demo:** hit a free limit, upgrade with test card 4242…, watch limits lift.

### Phase 7 — Ecosystem integration
- Public API + auth (API keys / OAuth) for external products.
- **Site Generator** (separate repo) embeds/links Vitalgather intake forms + event registration.
- (Much later) domain reselling via a registrar reseller API.

---

### Participant payments — Mode A ✅ done (2026-07-07)
- Per-event price + host's own payment channel (link + instructions) — money
  never touches the platform, so no processor can object to any host's
  practice. Set in event Settings → Payment.
- Public registration shows the price up front and a "Pay now" box after
  registering; participant portal shows Paid ✓ / $ due with the pay link.
- Roster: $ paid / $ due chips, offline-capable Mark paid/unpaid toggle
  (same outbox as check-ins), paid-count chip in the status strip.
- Later: Mode B (Stripe Connect for mainstream hosts, platform fee) and
  Mode C (high-risk gateway adapter) per the payments-posture decision below.

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
- **Event-discovery hub (Meetup-like) — public-facing dashboard:** a public,
  searchable homepage/dashboard where anyone can browse & search events/programs
  and hosts opt in to list. This is where **featured / popular / trending**
  showcases live (homepage rows). Prereqs: event image/thumbnail (above),
  categories/tags, geo location fields (not free-text), org public profiles,
  SEO-friendly listing pages, an "list publicly" opt-in per event, and a
  ranking signal for popular/trending (registrations, recency, views).
  Sequence AFTER billing (✅) + public API + site generator (those feed it
  hosts — a directory is only as good as its supply). Layers on the existing
  public `/r/[eventId]` pages; no rewrite.

## Operational TODOs (not code phases)
- [x] Domain wired end-to-end (2026-07-07): app on https://vitalgather.com (Railway
      custom domain, port 8080, Cloudflare DNS-only CNAME), vitalgather.app 301→.com,
      Resend domain verified, `EMAIL_FROM=Vitalgather <signin@vitalgather.com>`,
      `AUTH_URL=https://vitalgather.com`. Emails now deliver to ANY address.
- [x] `RESEND_API_KEY` set on Railway.
- [x] Renamed to **Vitalgather** (2026-07-06). Register vitalgather.com + .app, then wire domain (Railway custom domain, Resend verification, AUTH_URL/EMAIL_FROM).

## Polish backlog (small, high-value, any order)
- [x] **Google sign-in** — done 2026-07-07 (alongside magic links; email account
      linking; button only shows when AUTH_GOOGLE_ID/SECRET set).
- [ ] **Program progress on `/me`** — participants seeing their own journey
      through a program (current stage + completed stages).
- [ ] **BP trend chart** — turn the reading list into a line chart on the
      participant detail page + portal.
- [ ] **Kanban board view** for programs (columns by stage) — roster is the
      default; board as an alternate view.
- [ ] **Per-photo visibility toggle** — the enum exists
      (PUBLIC/PARTICIPANTS/PRIVATE, default PARTICIPANTS), just no UI to change it.
- [ ] **Event image / thumbnail** — host uploads a cover image per event (R2,
      reuse photo infra + sharp thumbnail). Shows on the public registration
      page and is a prerequisite for the discovery hub's event cards.
- [ ] **"Agreement" question type** — contracts-lite waiver checkbox; build when
      the first host asks (see Future considerations → Program contracts).
- [ ] **Timezone handling** — everything currently assumes one implicit zone;
      needs a deliberate design pass before hosts in different time zones show up.

## Operational TODOs (not code phases)
- [ ] **Stripe go-live** — activate the Vitalgather Stripe account (business
      details), swap `sk_test_` → `sk_live_` key, create the webhook in live mode
      (~15 min). Only when ready to charge real money; test mode works fully today.
- [ ] **Trademark filing** for Vitalgather (~$350 USPTO, optional, whenever
      revenue justifies). No collisions found 2026-07-06.
- [ ] **Cosmetic tech debt:** repo/folder + `@convene/*` package scope + Dexie DB
      name still say "convene" (invisible to users; Dexie rename would orphan
      queued offline data — leave it). Old grateful-balance-…up.railway.app still
      serves alongside vitalgather.com.
- [x] Domain wired end-to-end (2026-07-07): app on https://vitalgather.com (Railway
      custom domain, port 8080, Cloudflare DNS-only CNAME), vitalgather.app 301→.com,
      Resend domain verified, `EMAIL_FROM=Vitalgather <signin@vitalgather.com>`,
      `AUTH_URL=https://vitalgather.com`. Emails now deliver to ANY address.
- [x] `RESEND_API_KEY` set on Railway.
- [x] Stripe TEST-mode billing live (2026-07-07): dedicated Vitalgather Stripe
      account, `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` on Railway, webhook
      → `/api/billing/webhook`. Verified upgrade + cancel-at-period-end.
- [x] Google OAuth live (2026-07-07): `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` on
      Railway, consent screen published, redirect `…/api/auth/callback/google`.
- [x] Renamed to **Vitalgather** (2026-07-06).

## Suggested near-term focus
**Run a real event on it.** The product is feature-complete for real use; field
usage reorders this backlog better than planning can (every best improvement so
far — declutter, check-in, save feedback, mobile fixes — came from real use).
