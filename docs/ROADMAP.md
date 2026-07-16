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

### Event-discovery hub — Slice 1 ✅ done (2026-07-14)
- **Visibility model:** `Event.publicRegistration` bool expanded to an
  `EventVisibility` enum — **CLOSED** (no public page) / **UNLISTED** (link-only
  `/r` page, = the old `true`) / **LISTED** (registerable AND shown in the
  directory). Migration maps every existing public event → UNLISTED, so nothing
  visible changed for current hosts; LISTED is an explicit opt-in. Set via a
  3-way control in event Settings → Public registration.
- **Public directory** at `/discover`: upcoming LISTED events, thumbnail cards
  (reusing the R2 card thumb), free-text search over title/description/location/
  host name, and a **Popular** sort (by registration count) alongside **Soonest**.
  Registration count shows as an "N going" chip — the first ranking signal.
  Linked from the marketing homepage ("Browse events").
- **Deferred to later slices:** categories/tags, structured geo fields, org
  public profiles, SEO listing pages, view-based trending, and featured/homepage
  rows (the landing flips to content-first once supply grows — front door stays
  marketing for now to attract hosts).

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
- **Program contracts:** ✅ shipped 2026-07-07 as the "agreement" question type —
  host pastes terms and/or uploads a PDF/image (R2), participant must check
  "I have read and agree", acceptance recorded as a form submission (timestamp +
  form version + doc name). Full e-sign (DocuSign etc.) only on real demand.
  Vitalgather records assent; hosts own their legal text.
- **Team roles / authorized coordinators (per-member permissions):** large orgs
  want more than one operator — coordinators who get registration links, check
  people in, mark paid, log readings, and (trusted ones) create events / manage
  programs. Foundations already exist: `Membership` (role + status), the `Role`
  enum (OWNER/ADMIN/FACILITATOR/STAFF), `MembershipStatus.INVITED`, and
  `InviteKind.STAFF` — but only OWNER/ADMIN are enforced today (field capture is
  open to any member; INVITED is not honored). Plan:
  - **Roles first, not granular ACLs.** Map the 4 existing roles: OWNER (billing,
    delete/transfer, members) · ADMIN (create/edit/delete events, programs,
    forms; invite members) · FACILITATOR (run assigned events: check-in, mark
    paid, log BP + view health data, copy links; no org config) · STAFF
    (check-in + mark paid only; no health-data view). Add per-member granular
    flags only if a real org outgrows the roles. Gate "view health data"
    explicitly given the privacy posture.
  - **Membership is opt-in (anti-spam).** Invite by email → `Membership`
    (status INVITED) + `Invite` (kind STAFF, token) → invitee accepts via magic
    link → status ACTIVE. Only OWNER/ADMIN invite. Must fix: honor INVITED
    (`getMembershipRole` currently returns a role for non-DISABLED; dashboard
    lists all statuses) — no access until accepted; show as a pending tray.
  - **Dashboard discovery falls out for free:** members already see their orgs on
    /dashboard, events one click away — just filter to ACTIVE memberships + add a
    pending-invites tray. No /discover search needed for one's own managed events.
  - **Later (large orgs):** per-event assignment (scope a coordinator to specific
    events, not the whole org) via an `EventAssignment` join.
- **Anti-spam membership model — opt-in invites, NOT a friend graph** (open
  question resolved 2026-07-14): no friends/mutual-consent needed before managing
  events together. The Telegram-style spam vector (added to junk groups you never
  agreed to) only exists if being added is *involuntary* — invite-and-accept
  kills it: nobody is an active member without clicking accept, so nothing hits
  their dashboard until they opt in; a pending invite sits in a tray they ignore
  or decline at zero cost. Layer on: only OWNER/ADMIN send invites, invites are
  by known email, rate-limit pending invites for new/unverified orgs, members can
  leave + block an org. This is the Slack/GitHub/Notion workspace model — right
  for org→member; a social friend graph is the wrong shape and adds friction.
- **Bookmarks / favorites (save · follow · like):** let signed-in users save
  events, follow organizations, and like/favorite programs. Model as one
  polymorphic `Favorite` (userId, targetType EVENT|ORG|PROGRAM, targetId,
  createdAt; unique per user+target). Feeds the discovery hub — a "Saved" row,
  "follow an org → see its new listed events," and a soft popularity/ranking
  signal alongside registration count. Participant/public-facing (distinct from
  the host-side team roles above).
- **1-on-1 / individual sessions (ad-hoc-scheduled):** support private one-on-one
  sessions (a facilitator + a single client) alongside group events. Direction
  (brainstormed 2026-07-16):
  - **Reuse Event per session; don't build a "container" event.** Each session is
    its own record, reusing BP capture, intake, payment, and program stages with
    zero new plumbing. Rejected: one standing event that piles up participants —
    it abuses `Event.startsAt` (a single instant), can't hold per-client session
    times, and the day-of roster UI buckles under an accumulating list. For a
    purely *rolling* relationship with known clients, no event is needed at all —
    the Participant record is already a per-person timeline (readings w/ takenAt,
    submissions, program progress); a "session" can be a dated entry on the person.
  - **Add `Event.kind` (GROUP / ONE_ON_ONE)** — one cheap enum unlocks filtering/
    collapsing 1-on-1s in the events list, a streamlined single-person capture
    screen, and 1-on-1 defaults (unlisted, no public page). Turns the "clutter"
    and "creation friction" objections into UI problems, not model problems.
  - **Client flow = register-first, schedule-second (a "request" model, NOT a
    booking calendar).** The public/linkable surface is really an **offering** (a
    bookable 1-on-1 *type*: title, intake, price, description — no fixed time).
    Client registers + fills intake → that registration spawns a **session** for
    them (time TBD) → facilitator is notified, arranges + sets the date → client
    is notified of confirmation → app becomes the session log. So the host view of
    an offering is a **pipeline of sessions by status**, not a flat roster. This
    reconciles the earlier A-vs-B tension: the offering is the reusable container,
    but it holds discrete sessions, not a participant pile. Private = share the
    offering's unlisted `/r` link or a per-client invite link (existing); public =
    offering shows in the directory; embedded = offering link on the host's own
    site (ties to Site Generator / public API).
  - **New capabilities this implies (net-new today):** (1) a **session status
    lifecycle** — Requested (no time yet) → Scheduled → Completed → Cancelled/
    No-show — the backbone, since registration and scheduling are decoupled in
    time; (2) **notifications** — facilitator notified on a new request, client
    notified on confirmation. The app notifies hosts of *nothing* today; this is
    broadly useful (group hosts want "N new registrations" emails too), so build
    it generally. Two-sided confirmation (client gets "you're confirmed for X") is
    what makes it feel like a booking product, not just a form.
  - **Watch:** an offering has no single date, so the discovery card needs a
    variant (no `startsAt` sort, no "N going" chip — reads "Book a 1:1 →"). And
    1-on-1s burn the participant plan-limit fast → a pricing signal (heavy 1-on-1
    practitioners → Pro). "Scheduled ad-hoc" is one step from a real booking/
    calendar product (availability, slots, self-scheduling, reminders) — the
    `Event.kind` approach doesn't box that out; build booking only if 1-on-1s
    become central.
- **Photo/media storage limits:** R2 storage is the one usage that costs real
  money over time (R2 bills ~$0.015/GB-month *stored*, near-zero egress — so
  volume sitting in the bucket is the cost lever, not bandwidth). Today photo
  upload has **no** limit. `Photo.size` (bytes) is already recorded, so a per-org
  total-storage cap drops into the existing limits model: add `storageBytes` to
  `Plan.limits`, sum photo (+ event cover-image) bytes in the tenant layer,
  enforce before upload like the count-based `assertWithinLimit`, and show a
  storage meter on the org billing card (reuse the usage-meter UI). Tiers TBD
  (e.g. Free ~250–500 MB, Pro ~5–10 GB) — pick numbers once real usage/cost is
  known. Simpler stopgap if it bites sooner: a per-event photo *count* cap.
- **Event-discovery hub (Meetup-like) — public-facing dashboard:** a public,
  searchable homepage/dashboard where anyone can browse & search events/programs
  and hosts opt in to list. This is where **featured / popular / trending**
  showcases live (homepage rows). **Slice 1 shipped 2026-07-14** — visibility
  enum, `/discover` search + Popular sort (see the dated section above). Still
  ahead: categories/tags, geo location fields (not free-text), org public
  profiles, SEO-friendly listing pages, view-based trending, and content-first
  homepage rows. Sequence the supply-side (public API + site generator) alongside
  — a directory is only as good as its supply. Layers on the existing public
  `/r/[eventId]` pages; no rewrite.

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
- [x] **Event image / thumbnail** — done 2026-07-08. Cover (1280w webp) +
      card thumb (600x400) in R2 via sharp; Settings → Cover image uploader;
      shown on public /r page + org event cards. Discovery-hub cards ready.
- [ ] **"Agreement" question type** — contracts-lite waiver checkbox; build when
      the first host asks (see Future considerations → Program contracts).
- [x] **Timezone handling** — done 2026-07-08. Events anchored to a venue IANA
      timezone (Event.timezone); startsAt is a real UTC instant (DST-aware via
      date-fns-tz); displayed in the event's zone with a label everywhere.
      Non-event timestamps (BP/submissions/renewals) show in the viewer's local
      zone via <LocalTime>.

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
