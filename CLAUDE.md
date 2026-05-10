# Aarna — Claude Context

This file is read automatically at the start of every Claude session in this project.
Do not delete it.

---

## What This Project Is

Aarna by Arpitha Abhishek — a women's indo-western fashion e-commerce platform.
Built by Solaris Studios. India-only, English, INR, online payments only (no COD).
Fixed price: ₹1,30,000. Timeline: 10–12 weeks. Currently in Week 1.

---

## The Team

- **Sam (you)** — project lead, handles all backend, can do frontend too
- **Vismaya** — frontend only, zero backend knowledge, uses AI to build UI
- **Rule:** Sam reviews every PR. Nothing merges without Sam's approval.

---

## Stack — Locked, Do Not Change

- Next.js 15 App Router on Vercel
- TypeScript
- Supabase Postgres + Auth
- Drizzle ORM
- Tailwind CSS v4 + shadcn/ui (admin only)
- Zustand (cart state)
- React Hook Form + Zod
- Cloudinary (images)
- Razorpay (payments)
- Shiprocket (shipping)
- Interakt/AiSensy WhatsApp BSP
- Resend (email)
- Cloudflare (CDN + WAF)

---

## What Is Already Done

- [x] GitHub repo live — github.com/Sam1512-tech/Aarna (public, branch protected)
- [x] CODEOWNERS set up — FE/BE ownership enforced
- [x] Vismaya invited as collaborator (@vismayahm21-lab)
- [x] Full Next.js 15 scaffold with all dependencies installed
- [x] Folder structure matches technical plan exactly
- [x] Tailwind design tokens configured (ivory/sand/taupe/warm-grey/maroon/ink, Cormorant+Poppins)
- [x] Drizzle schema written — all 20+ tables from the technical plan
- [x] Schema pushed to Supabase (aarna-dev project, Mumbai region)
- [x] .env.local created with real Supabase keys (gitignored)
- [x] SSH set up for git push — no PAT needed
- [x] HANDOFF.md written for Vismaya — her complete day-1 brief
- [x] AI context + task briefs written for Vismaya — covers all 11 tasks

---

## What Is In Progress / Not Done Yet

- [ ] Razorpay KYC — Sam to submit (docs: PAN, bank, address proof, Aadhaar)
- [ ] Shiprocket KYC — waiting for client to confirm Shiprocket vs Delhivery
- [ ] WhatsApp BSP (Interakt) — waiting for client's Facebook Business Manager + spare phone number
- [ ] Mood board approval from client in writing — needed to trigger ₹52K milestone payment
- [ ] Server actions — all stubbed, need real implementations (Sam's job)
- [ ] Supabase Auth email templates via Resend — not wired
- [ ] RLS policies on Supabase — not set up
- [ ] DB seed — 5 categories not yet seeded
- [ ] All 3rd-party integrations — Cloudinary, Razorpay, Shiprocket, WhatsApp, Resend

---

## File Ownership

### Sam owns (backend — never edit these on Vismaya's behalf)
- `lib/db/` — Drizzle schema + queries
- `lib/actions/` — all server actions (the typed API Vismaya calls)
- `lib/supabase/` — Supabase client helpers
- `lib/razorpay/`, `lib/shiprocket/`, `lib/whatsapp/`, `lib/resend/`, `lib/cloudinary/`
- `app/api/` — all webhook handlers
- `middleware.ts` — RBAC, session refresh
- `drizzle/` — migrations
- `drizzle.config.ts`, `next.config.ts`
- `.env.local`, `.env.example`

### Vismaya owns (frontend)
- `app/(storefront)/` — all public storefront pages
- `app/(auth)/` — login, signup, forgot password
- `app/admin/` — admin dashboard UI
- `components/` — all UI components
- `hooks/` — custom React hooks
- `store/` — Zustand stores
- `public/` — static assets

---

## Key Architecture Decisions

- **Single Next.js app** — storefront + admin + API all in one deployment
- **Server actions as the FE/BE contract** — Vismaya calls typed functions from lib/actions/, never writes SQL or API calls directly
- **No Figma** — building directly from the mood board. Client approval via WhatsApp message replaces the Figma approval milestone.
- **No COD** — Razorpay online only
- **Non-GST** — issue "Bill of Supply" not "Tax Invoice"
- **shadcn/ui for admin only** — storefront is fully custom for premium feel

---

## Design Tokens (already in globals.css)

Colors: `bg-ivory` (#FAF7F2), `bg-sand` (#E0D0C6), `bg-taupe` (#C8BFB3), `bg-warm-grey` (#9D948E), `bg-maroon` (#4B1323), `bg-ink` (#111111)
Fonts: `font-display` (Cormorant Garamond), `font-sans` (Poppins)

---

## Supabase Project

- Project: `aarna-dev` (development)
- Region: Mumbai (ap-south-1)
- URL: https://ytabocdpyqxpqckbzryk.supabase.co
- Org: client's Supabase account (Sam is admin)
- Prod project: not created yet — create before go-live (Week 12)

---

## Git Workflow

- `main` is protected — PRs only, 1 approval required, no force push
- Sam's branches: `be/<feature>` (e.g. `be/cart-actions`)
- Vismaya's branches: `fe/<feature>` (e.g. `fe/homepage`)
- SSH is configured — `git push` works without tokens
- All merges go through GitHub PRs

---

## Payment Milestones

- ₹40,000 advance — already received
- ₹52,000 — on mood board/design approval (get written confirmation from client NOW)
- ₹39,000 — on go-live (Week 12)

---

## Immediate Next Steps for Sam

1. Get mood board approval from client in writing → triggers ₹52K payment
2. Submit Razorpay KYC today
3. Confirm Shiprocket with client → start their KYC
4. Wait for client on WhatsApp BSP (Facebook BM + spare number)
5. Seed the DB with 5 categories
6. Wire getCategories, getCollections, getNewArrivals, getProducts, getProductBySlug server actions
7. Set up RLS policies on Supabase
8. Set up Supabase Auth + Resend email templates

---

## Backend Build Order (Sam's sequence)

1. `lib/actions/products.ts` — read-side actions (getProducts, getProductBySlug, etc.)
2. `lib/actions/cart.ts` — cart CRUD
3. `lib/actions/auth.ts` — sign in, sign up, sign out, reset password
4. `lib/actions/checkout.ts` — create order, validate pincode
5. `lib/actions/account.ts` — orders, wishlist, addresses, returns
6. `lib/cloudinary/` — upload helper
7. `lib/resend/` — email templates (order confirm, verify, reset)
8. `lib/razorpay/` — create order, verify payment, refund + webhook handler
9. `lib/shiprocket/` — create shipment, AWB, tracking + webhook handler
10. `lib/whatsapp/` — send template, delivery receipt logging + webhook handler
11. Admin server actions — products CRUD, orders, inventory, coupons, banners, reviews

---

## Risks to Watch

- WhatsApp BSP onboarding + Meta template approval — start day 1, not week 4
- Product photography — lock shoot date with client immediately
- Razorpay activation delay — KYC submitted is not KYC approved
- Staying ahead of Vismaya on server actions — she builds fast with AI
