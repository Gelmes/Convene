# Decision log

Choices locked during the architecture Q&A (2026-07-02). Each is a seam we've committed to; revisit explicitly if reversing.

| # | Decision | Choice | Rationale / consequence |
|---|---|---|---|
| 1 | **Compliance posture** | Wellness-grade now; architected to harden to clinical/HIPAA later | Health data isolated in its own table, encryption seam + audit log from day 0. No rewrite to go clinical. |
| 2 | **Build scope** | Everything, but phased | See ROADMAP. Each phase ships standalone. |
| 3 | **Field capture client** | PWA (not native) | One Next.js codebase, offline + installable, no app store. Capacitor wrap available later if device access needed. |
| 4 | **Stack** | Next.js + Postgres + Prisma + Auth.js + Tailwind/shadcn, Turborepo/pnpm | Solo-builder speed + strong AI training data. Railway-native. |
| 5 | **Onboarding** | Both: participant self-registers per event **and** host adds + sends invite link | Requires Participant records that exist without an account and get *claimed* later. |
| 6 | **Billing** | Deferred; build the seam only | `Organization.planId` + Plan/Subscription stubs exist; Stripe wired in Phase 6. Free until then. |
| 7 | **Photos** | Later phase (Phase 4), on Cloudflare R2 | Object storage since Railway has no blob store; cheap egress. |
| 8 | **Scale target** | Small now (you + a few hosts), seams to reach medium | Single Postgres, shared-schema multi-tenancy via `organizationId`. No sharding/RLS until needed. |
| 9 | **Multi-tenancy** | Shared DB, row-level isolation by `organizationId`, enforced in data-access layer | Optional Postgres RLS later as defense-in-depth. |
| 10 | **Product boundaries** | Host Manager (this repo) · Program Tracker (module) · Site Generator (separate repo, API integration) | Site Generator and domain reselling never share internals — integrate over public API. |
| 11 | **Hosting** | Railway (web + Postgres + cron) | User's stated preference. |

## Open questions (not blocking architecture)
- **Name.** "Convene" is a placeholder. Decide the real product/ecosystem name before public assets.
- **BP device input.** Manual entry assumed. If Bluetooth cuffs matter later → Capacitor wrap.
- **Program tracker UX.** Model is flexible (Program→Stages); the *interface* for defining pipelines is still fuzzy — design it when we reach Phase 5.
- **Domain reselling partner.** HostGator is a page-host, not a registrar reseller. Real options later: Namecheap / OpenSRS / Enom reseller programs. Far-future.
