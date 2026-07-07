# Vitalgather

> Named 2026-07-06: **vital** signs + **gather**ings — the product in one word. Domains: vitalgather.com / vitalgather.app.

A multi-tenant platform for **event hosts / facilitators** to run events, capture participant health data (blood pressure, notes) in the field, collect custom intake forms, and give participants a portal to see their data, events, and (later) photos.

This repo is **one product in a three-product ecosystem**. The products are intentionally decoupled and talk over clean APIs:

1. **Host Manager** (this repo, build-first) — events, participants, field health-data capture, custom intake forms, participant portal, and (later) a program/client tracker.
2. **Program / Client Tracker** — a *module* of the Host Manager. Configurable pipelines that move a participant through stages/levels across multiple programs. Ships as a later phase.
3. **Site Generator** (separate repo, later) — AI-generated marketing sites + logos for hosts, eventually domain/hosting reselling. Links *into* the Host Manager (e.g. embeds an event's intake form) over its public API. Architecturally independent.

## Status

🟢 **Live on Railway through Phase 2.** Foundation (multi-tenant orgs, magic-link auth, audited/encryptable health data) → Phase 1 field capture (events, on-the-spot participants, mobile BP entry, **offline PWA with sync**) → Phase 2 intake forms (builder, public self-registration links, personal invite links, host fill). Next: Phase 3 (participant portal). See [Roadmap](docs/ROADMAP.md).

- [Architecture](docs/ARCHITECTURE.md) — stack, multi-tenancy, PWA/offline, security model, monorepo layout
- [Data model](docs/DATA-MODEL.md) — entities, health-data isolation, program tracker
- [Roadmap](docs/ROADMAP.md) — the build phases
- [Decisions](docs/DECISIONS.md) — the choices we locked in and why
- [Deploy](docs/DEPLOY.md) — run locally + ship to Railway

## Quick start

```bash
pnpm install
pnpm db:generate
pnpm dev   # http://localhost:3000  (sign-in works; DB actions need a Postgres — see docs/DEPLOY.md)
```

## The one-paragraph pitch

A host signs up, creates an **organization** (their business), and creates an **event**. Participants **self-register** through a public link, or the host **adds them and sends an invite link**. At the event, the host opens the PWA on their phone, walks up to a participant, and records **blood pressure + a note in seconds** — even with no signal (it syncs later). Participants can **claim an account** to see their own readings, the events they attended, and eventually event photos. As the host grows, they can define **custom intake forms** and **multi-stage programs** to track where each participant is in their journey.
