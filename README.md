# Aarna

E-commerce storefront and admin for **Aarna** — an indo-western women's fashion brand.

> Built by Solaris Studios. Internal repo. Do not share with the client.

---

## Stack

- **Next.js 15** (App Router) on **Vercel**
- **TypeScript** end-to-end
- **Supabase** (Postgres + Auth + Storage)
- **Drizzle ORM** for the database layer
- **Tailwind CSS v4** + shadcn/ui (admin) + custom storefront
- **Razorpay** payments · **Delhivery** logistics · **WhatsApp BSP** notifications · **Resend** email · **Cloudinary** images · **Cloudflare** WAF/CDN

The full stack rationale and 12-week phase plan live in the technical implementation plan PDF (not in this repo).

## Getting started

1. Clone, then install:
   ```bash
   npm install
   ```
2. Copy env:
   ```bash
   cp .env.example .env.local
   ```
   Get the real values from the shared 1Password vault.
3. Push the schema to your Supabase dev DB:
   ```bash
   npm run db:push
   ```
4. Run the dev server:
   ```bash
   npm run dev
   ```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server on `localhost:3000` |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate a Drizzle migration from schema changes |
| `npm run db:push` | Apply schema directly to the dev DB (no migration file) |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Open Drizzle Studio to browse the DB |

## Repo layout

```
app/
  (storefront)/        # public site — FE territory
  (auth)/              # login, signup
  admin/               # admin dashboard — gated by middleware
  api/webhooks/        # razorpay, delhivery, whatsapp — BE only
components/
  storefront/          # storefront components
  admin/               # admin components (shadcn-based)
  ui/                  # shared primitives
hooks/                 # client hooks (useUser, useCart, ...)
store/                 # Zustand stores (cart)
lib/
  db/                  # Drizzle schema + client — BE only
  actions/             # server actions — BE writes, FE consumes
  supabase/            # auth helpers (browser, server, middleware)
  razorpay/            # Razorpay SDK wrapper
  delhivery/           # Delhivery REST client
  whatsapp/            # BSP wrapper
  resend/              # email sender
  cloudinary/          # signed uploads + helpers
  utils.ts             # cn(), formatINR(), slugify()
  types.ts             # shared types (re-exported from Drizzle)
  mocks/               # fake data for FE while BE catches up
drizzle/
  migrations/          # generated SQL migrations
middleware.ts          # auth + RBAC for /admin and /account
```

## Working in this repo (FE / BE split)

- **Sam (`@Sam1512-tech`)** owns everything backend: `lib/db`, `lib/actions`, `lib/<integration>`, `app/api`, `middleware.ts`, schema, secrets, infra.
- **Vismaya (`@vismayahm21-lab`)** owns everything frontend: `app/(storefront)`, `app/(auth)`, `app/admin` UI, `components`, `hooks`, `store`, Tailwind, design tokens.

The contract between them is **server actions** in `lib/actions/`. The FE dev imports them as typed async functions — they never write Drizzle queries or touch any third-party SDK.

CODEOWNERS enforces this: backend folders require Sam's review.

See `HANDOFF.md` for the day-1 onboarding for the FE dev.

## Branch & PR rules

- `main` is protected. All changes go through PRs.
- Branch naming: `fe/<slug>` (frontend dev), `be/<slug>` (backend dev), `chore/<slug>`.
- One reviewer (Sam) approves before merge.
- PRs use the template in `.github/pull_request_template.md`.

## Out of scope (per technical plan)

COD · GA4/Meta Pixel · loyalty/CRM · native mobile apps · multi-language/currency · keyword research/copywriting · product photography · legal page copy.
