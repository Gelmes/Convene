# Running & deploying

## Prerequisites
- Node 20+ (repo uses 22)
- pnpm 9 (`npm i -g pnpm@9`)

## Local development

```bash
pnpm install
cp .env.example .env                 # root: used by Prisma
cp .env.example apps/web/.env.local  # app:  used by Next.js dev/runtime
# set AUTH_SECRET:  npx auth secret   (or: openssl rand -base64 32)

pnpm db:generate                     # generate Prisma client
pnpm db:push                         # create tables in your dev DB (needs DATABASE_URL)
pnpm dev                             # http://localhost:3000
```

**No Postgres yet?** The landing (`/`) and sign-in (`/sign-in`) pages render without a
database. Anything that reads/writes data (dashboard, creating an org) needs a real
`DATABASE_URL`. Fastest path: create a Railway Postgres and paste its connection string
into both env files.

**Signing in without email:** leave `RESEND_API_KEY` empty — the magic-link URL is
printed to the **server console**. Copy it into your browser to complete sign-in.

## Deploying to Railway

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo**, pick this repo.
3. Add the **PostgreSQL** plugin. Railway injects `DATABASE_URL` automatically.
4. Set service variables: `AUTH_SECRET`, `AUTH_URL` (your Railway URL),
   `AUTH_TRUST_HOST=true`, `EMAIL_FROM`, and `RESEND_API_KEY` (once you have a
   Resend account). Optionally `ENCRYPTION_MODE=on` + `ENCRYPTION_KEY` to enable
   clinical-grade field encryption.

   > **Gotcha:** if `AUTH_URL` / `AUTH_TRUST_HOST` are missing, Auth.js falls back
   > to `http://localhost:3000` and magic-link URLs will point at localhost (they
   > won't work in a browser). The app still boots — you only notice when a link
   > is dead. Always set both on any non-localhost deploy.

5. **Event photos (Cloudflare R2).** Create a bucket + API token in the
   Cloudflare dashboard (R2 → Create bucket; R2 → Manage API Tokens →
   Create API Token with *Object Read & Write* scoped to that bucket), then set:
   - `R2_ACCOUNT_ID` — Cloudflare account id (shown on the R2 overview page)
   - `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — from the API token
   - `R2_BUCKET` — the bucket name

   The bucket stays **private** — no public access, no CORS config needed.
   Uploads are proxied through the app; images render via presigned GET URLs.
   Without these vars the app runs fine; the Photos card shows a setup note.
5. `railway.json` already defines build + start:
   - **build:** `pnpm install --frozen-lockfile && db generate && web build`
   - **start:** `prisma migrate deploy && next start`
6. First deploy runs `prisma migrate deploy`. Before that works you need a committed
   migration — create one locally against a dev DB with `pnpm db:migrate --name init`,
   then commit the generated `packages/db/prisma/migrations/` folder.

## Useful scripts (run from repo root)
| Command | What |
|---|---|
| `pnpm dev` | Run the app in dev |
| `pnpm build` | Build everything |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm db:generate` | Regenerate Prisma client |
| `pnpm db:migrate` | Create/apply a dev migration |
| `pnpm db:push` | Push schema without a migration (quick dev) |
| `pnpm db:studio` | Open Prisma Studio |
