# Aarna — Claude Context

This file is read automatically at the start of every Claude session in this project.
Do not delete it.

---

## What This Project Is

Aarna by Arpitha Abhishek — a women's indo-western fashion e-commerce platform.
Built by Solaris Studios. India-only, English, INR, online payments only (no COD).
Fixed price: ₹1,30,000 (+₹18,000 hang-tag change request → ₹1,53,000 revised).
**HARD DEADLINE: launch by July 20, 2026 — no slippage allowed (client mandate, ~Jul 4).**

**Launch scope (confirmed by client):**
- 16 products at launch
- 2 categories at launch: **Dresses** and **Tops**
- Long-term vision: client self-manages everything via admin (categories, products, collections, banners, coupons) — zero developer involvement needed after handover

**Critical architecture rule:** category names must always come from `getCategories()` — never hardcoded as strings anywhere in the codebase (not even as fallbacks). When the client adds a new category via admin, it must appear automatically wherever categories are displayed.

**Frontend design direction is fully Vismaya's call** — palette, typography, brand voice, layout, copy, section structure. Client has approved her direction. The only frontend constraint is the dynamic-categories rule above.

---

## 🚨 CURRENT STATUS — July 4, 2026 (launch sprint to July 20)

**Full-scope audit completed Jul 4** (27 checks vs. quotation + this file). State of the world:

### Verified working (live-tested, not just compiling)
Prod build clean (33 routes) · Code 128 barcode + 50×30mm hang-tag PDF + GST invoice PDF all generate correctly (live-tested) · homepage renders dynamic banners/arrivals/categories · guest checkout open · coupon UI · Razorpay modal flow → `/payment-processing` → `/order-confirmation` · all 3 Razorpay webhook events · Delhivery status webhook · all 4 WhatsApp triggers (opt-in gated, no-op until API key) · OTP code in branded email · PDP SEO (metadata + JSON-LD) · RLS on all 20 tables · admin RBAC gate.

### Storefront (Vismaya) — ~all pages shipped
Homepage, PLP (/shop + /shop/[category]), PDP, cart, checkout, payment-processing/failed, order-confirmation, search, full account section, legal pages (/privacy-policy, /return-policy, /shipping-policy, /terms, /contact, /fabric-care — note: NOT /privacy etc.), auth. **Auth = password + email-OTP + Google OAuth (all three; OTP-only was reverted by client-approved decision).** Google OAuth is enabled in Supabase (client ID 1095605963037-…) and verified working.

### Admin
All 8 list pages + shell + dashboard merged — **but read-only**. Vismaya is building all CRUD forms/actions now (product form first — MRP/fabric/care fields + Print Tags button + Cloudinary upload; order detail w/ "Create shipment" button + status + AWB + invoice download; inventory adjust w/ autofocused search for barcode scanner; coupons/banners/collections/reviews/returns actions). **ETA Jul 5.**
One admin exists: Arpitha, `aarnabyarpithabhishek@gmail.com`, Supabase UID `5644c143-c259-4410-91df-51684db6bc9c`, role owner.

### Known gaps / decisions pending (from audit)
- **Broken links** in header/footer/cart/search: `/collections`, `/about`, `/shop/new-arrivals`, `/shop/bestsellers` → routes don't exist / no such categories. Vismaya deciding: build vs re-point.
- **Quotation debt, not built:** customer reviews UI (no way to write/see reviews on storefront), product zoom on PDP, best-sellers ranking, rate limiting, Cloudflare CDN (DNS is Hostinger→Vercel direct), handover documentation. Decide build-vs-descope with client before launch.
- **DB content: 0 products, 0 banners, 0 collections.** Blocked on admin forms + **product photography (status UNCONFIRMED — chase Arpitha).**
- `requestReversePickup` stubbed (manual returns OK); WhatsApp read-receipts not persisted; search is client-side over 60 products (fine at launch scale).

### External / accounts state
- **Razorpay: LIVE keys approved + stored in `.env.local` as `RAZORPAY_LIVE_KEY_ID/SECRET` (production-only — active vars stay TEST until QA passes).** Live webhook secret still needs generating once prod URL exists. Test webhook secret also still pending (old dashboard outage).
- **WhatsApp/Interakt: account live, number connected via Meta, FB Business Manager VERIFIED.** Blocked on API-key access ("connect your mobile number", 24h wait) — **handed to Vismaya** (support email drafted; she also submits the 4 templates from `docs/whatsapp-templates.md` to Meta).
- **shopaarna.in is LIVE with a placeholder mini-site** (coming-soon + shop preview + about/contact + all policy pages w/ GSTIN) — repo `aarna-coming-soon` under Arpitha's GitHub (`aarnabyarpithabhishek-collab`, also repo collaborator), deployed on **her** Vercel (Hobby). Built to pass Razorpay/Meta/Delhivery site checks (it did).
- **Supabase Send-Email hook configured** (secret in env, hook enabled, placeholder URL) — re-point URL to real app at deploy.
- Delhivery fully configured (`Aarna Godown`/560085, prod base, webhook token). `DELHIVERY_CLIENT_NAME`/`DELHIVERY_MODE` env vars are unused leftovers — ignore.

### Hardware (client purchase list)
Xprinter XP-365B (~₹3.5K) + 4×6" and 50×30mm rolls; TVS BS-C101 Star 1D scanner (~₹2K). Scanner = keyboard wedge, zero integration; scans SKU into `/admin/inventory` search (matches on SKU).

### DEPLOY PLAN — Jul 5, after Vismaya's admin PRs merge (first task of the day)
1. Vercel under **Sam's** account (Sam1512-tech) — transfer to client at handover. Import repo, paste env vars (full list with test-Razorpay convention is in the Jul 4 session; `.env.example` documents it).
2. Set `NEXT_PUBLIC_APP_URL` to the assigned `*.vercel.app` URL first (QA), redeploy.
3. Post-deploy config: Razorpay TEST webhook → deployed URL (get `RAZORPAY_WEBHOOK_SECRET`); Supabase Auth hook URL + Site URL/redirect allowlist; Google OAuth authorized origins += vercel.app URL; Delhivery status webhook URL.
4. Full QA with test keys (card 4111…, UPI success@razorpay), incl. real shipment creation via new `createDelhiveryShipment` admin action.
5. Only after QA: flip Razorpay env to live keys, create LIVE webhook, load real products/banners, re-point shopaarna.in DNS from placeholder to real app, set `NEXT_PUBLIC_APP_URL=https://shopaarna.in`, create prod Supabase (+ `npm run db:rls`) or accept dev DB at launch (decide).

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
- Delhivery (shipping)
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
- [x] Tailwind + globals.css scaffolded — Vismaya owns the actual design tokens
- [x] Drizzle schema written — all 20+ tables from the technical plan
- [x] Schema pushed to Supabase (aarna-dev project, Mumbai region)
- [x] .env.local created with real Supabase keys (gitignored)
- [x] SSH set up for git push — no PAT needed
- [x] HANDOFF.md written for Vismaya — her complete day-1 brief
- [x] AI context + task briefs written for Vismaya — covers all 11 tasks
- [x] DB seed — Dresses and Tops seeded via scripts/seed.ts
- [x] Razorpay KYC approved; test keys configured in .env.local
- [x] Razorpay library wired — `createRazorpayOrder`, `verifyWebhookSignature`, `verifyPaymentSignature`, `createRefund`
- [x] Tax Invoice PDF generator — `lib/invoice/template.tsx` + `lib/invoice/generate.ts` (A4, GST-compliant, CGST+SGST/IGST, HSN 6211, 12%)
- [x] Sequential invoice numbering via Postgres sequence — format `AL/26-27/00001`
- [x] Razorpay webhook (`payment.captured`) wired end-to-end — generates invoice number → PDF → emails customer with attachment
- [x] Resend `sendEmail` implemented with order receipt HTML template; graceful when API key missing
- [x] Direct Supabase connection URL for schema migrations (`DIRECT_URL` env var)
- [x] **Priority 1 server actions complete (unblocks Vismaya):**
    - `lib/actions/products.ts` — getCategories, getProducts, getProductBySlug, getCollections, getNewArrivals, getRelatedProducts
    - `lib/actions/cart.ts` — getCart, addToCart, updateCartItem, removeFromCart, applyCoupon, mergeGuestCartOnLogin (cookie-based guest cart + Supabase auth)
    - `lib/actions/checkout.ts` — initCheckout (validates cart, generates order, creates Razorpay order), checkPincodeServiceability (calls Delhivery pincode API; optimistic fallback pre-KYC)

---

## What Is In Progress / Not Done Yet

> ⚠️ Historical detail — where this conflicts with the **🚨 CURRENT STATUS (July 4)** section above, the status section wins.

- [ ] **Razorpay webhook secret** — Razorpay dashboard has a platform outage (2 days+); add `RAZORPAY_WEBHOOK_SECRET` once dashboard is back
- [x] Delhivery — Delhivery One account live; API token + pickup (`Aarna Godown`, 560085) + generated `DELHIVERY_WEBHOOK_TOKEN` in `.env.local` (production base `track.delhivery.com`). **Live serviceability verified** (prepaid serviceable: Bengaluru/Delhi/Mumbai/Kolkata/Sikkim); checkout pincode check now hits the real API. **Remaining:** live shipment creation + AWB + status webhook — exercised at deploy/first real shipment (webhook needs the deployed URL). Pickup name must match the Delhivery One panel exactly.
- [ ] WhatsApp BSP (Interakt) — **code complete**, blocked on client (Facebook Business Manager + spare number) + Meta template approval. `sendTemplate()` (Interakt) + all 4 trigger points wired (order_placed, delivered, return_received, refund_processed), opt-in gated via `orders.whatsapp_opt_in`, every send logged to `message_log`. Graceful no-op until `WHATSAPP_API_KEY` is set. Template drafts: `docs/whatsapp-templates.md` (submit to Meta once the Interakt account exists).
- [x] Resend — account live, domain `shopaarna.in` verified (DKIM + SPF + DMARC + tracking CNAME added in Hostinger DNS), `RESEND_API_KEY` + `RESEND_FROM_ADDRESS="Aarna <hello@shopaarna.in>"` in `.env.local`; live order-receipt test send to Gmail succeeded. Inbound mailbox `hello@shopaarna.in` now live via **Hostinger Email** (root MX mx1/mx2.hostinger.com + SPF `_spf.mail.hostinger.com`); coexists cleanly with Resend's `send`-subdomain records (sending + receiving both work, no conflict). All 4 email templates redesigned with the brand identity — gold logo on maroon header, gold seam, serif headings, branded footer; logos Cloudinary-hosted under `aarna/brand/`
- [x] Cloudinary — account connected, keys in `.env.local`; `lib/cloudinary/` signed-upload helper done and verified live (upload → fetch metadata → f_auto/q_auto transform → destroy all OK)
- [x] Mood board / design approval received from client → ₹52K milestone unlocked (payment received ~27 Jun 2026)
- [ ] Priority 2 — Auth & Account:
    - [x] `lib/actions/auth.ts` — signup/login/logout/reset password (Supabase Auth)
    - [x] `lib/actions/account.ts` — orders, wishlist, addresses, returns
    - [x] `middleware.ts` — Supabase session refresh + `/admin` & `/account` redirects. Admin RBAC is enforced in `app/admin/layout.tsx` via `getCurrentAdmin()` (Drizzle can't run in edge middleware, so the admins-table check lives in the server-component layout)
    - [x] Supabase Auth → Resend — Send Email hook at `app/api/auth/email-hook/route.ts` renders branded verify/reset templates via `lib/resend` (Standard Webhooks signature verified; tested locally). **Activate at deploy:** Supabase dashboard → Auth → Hooks → Send Email (HTTPS, point at the route) + set `SUPABASE_AUTH_HOOK_SECRET`
    - [x] RLS policies — `lib/db/rls.sql` (default-deny on all 20 public tables; apply with `npm run db:rls`). Applied + verified on aarna-dev (anon REST now returns 0 rows). Server actions use the Drizzle owner role which bypasses RLS; this only locks the public PostgREST/anon surface. **Re-run `npm run db:rls` on the prod project before go-live.**
- [ ] Priority 3 — Integrations: `lib/delhivery/` (client + serviceability + webhook done; shipment creation/tracking stubbed pending KYC token), `lib/whatsapp/` (Interakt `sendTemplate` + opt-in `notify` helper + 4 trigger points wired; graceful no-op until BSP API key + Meta approval)
- [ ] Priority 4 — Webhooks: Delhivery webhook wired (status → fulfillment_status); Razorpay `payment.failed` + `refund.processed` now handled (refund flips order status + emails customer). Implement live Delhivery shipment creation + tracking once the KYC API token is set
- [x] Priority 5 — Admin server actions (categories, products, orders, inventory, coupons, banners, collections, **reviews**, **returns**) + product hang tag PDF generator

---

## File Ownership

### Sam owns (backend — never edit these on Vismaya's behalf)
- `lib/db/` — Drizzle schema + queries
- `lib/actions/` — all server actions (the typed API Vismaya calls)
- `lib/supabase/` — Supabase client helpers
- `lib/razorpay/`, `lib/delhivery/`, `lib/whatsapp/`, `lib/resend/`, `lib/cloudinary/`
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
- **Customer communication split** — Aarna only emails 4 things via Resend: order confirmation (with invoice PDF), email verification, password reset, refund processed. **All shipping milestones (shipped, in transit, out for delivery, delivered) are sent by Delhivery's own customer-communication system.** Don't duplicate them — confuses the customer with two messages saying the same thing.
- **WhatsApp scope — key milestones only** — WhatsApp (Interakt BSP) sends 4 templates: `order_placed`, `delivered`, `return_received`, `refund_processed`. Shipping-in-progress updates (shipped, out for delivery, in transit) are **not** sent via WhatsApp — Delhivery owns those, same no-duplication rule as email. Template drafts + variable mappings live in `docs/whatsapp-templates.md` (all UTILITY category, pending Meta approval). Copy is Vismaya's voice call.
- **GST registered** — issue proper "Tax Invoice" not "Bill of Supply". Business legal name: **Aarna Label**. GSTIN: `29ACNFA3302J1ZD` (Karnataka). Registered address: No. 3571, 1st H Cross, Behind Girinagar Police Station, Giri Nagar, Bengaluru – 560085, Karnataka. Business phone: +91 79-75639485. Include GSTIN on all order invoices. Use CGST 6% + SGST 6% for intra-state orders (Karnataka), IGST 12% for inter-state. HSN code for garments: 6211. **Invoice number format:** `AL/26-27/00001` (financial year, resets every April).
- **shadcn/ui for admin only** — storefront is fully custom for premium feel
- **Dynamic categories** — wherever categories appear on the storefront, they come from `getCategories()`. No category names hardcoded anywhere — when client adds a category in admin it appears automatically. (How and where Vismaya chooses to display them is her call.)
- **Admin is self-service** — after handover, client manages categories, products, collections, banners, coupons entirely via admin. No dev needed for content changes

---

## Design

Vismaya owns frontend design end-to-end — palette, typography, brand voice, layout, copy. Client has signed off on her direction. Backend has no opinion on these; don't impose old design tokens on her.

---

## Domain & Hosting

- Client has bought a **domain + hosting on Hostinger for 3 years**
- **Domain** → keep on Hostinger, change nameservers to point to Cloudflare → works perfectly
- **Hostinger hosting** → cannot be used. Hostinger is shared PHP hosting — it cannot run Next.js App Router (server actions, SSR, webhooks, auth all break). It will sit unused.
- **Actual hosting** → Vercel (as planned). Free tier covers launch. Upgrade to Vercel Pro (~$20/month) if traffic demands it.
- **Do not tell the client** the hosting is wasted — just say "the domain works, we host on Vercel which is purpose-built for this stack, no extra cost at launch."

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
- ₹52,000 — design approved; payment received (~27 Jun 2026)
- ₹39,000 — on go-live (Week 12)

---

## Immediate Next Steps (launch sprint — see 🚨 CURRENT STATUS for full detail)

1. **Jul 5:** review + merge Vismaya's admin CRUD PRs → then **deploy to Vercel** (step-by-step plan in the status section)
2. Post-deploy config: Razorpay test webhook, Supabase auth hook URL + redirect allowlist, Google OAuth origins, Delhivery webhook
3. **Chase Arpitha on product photography TODAY** — the single biggest launch risk; 0 products in DB until photos + admin form exist
4. Vismaya: Interakt API key (support ticket) + submit 4 WhatsApp templates to Meta (1–7 day review — clock is running)
5. Full QA on test keys → flip to live Razorpay keys + live webhook → load real content → DNS cutover from placeholder to real app
6. Decide with client: reviews UI / product zoom / `/collections` page — build or descope from Jul 20 launch
7. Pre-go-live: prod Supabase (or accept dev DB), `npm run db:rls` on prod, handover docs + Loom videos, transfer Vercel to client

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
9. `lib/delhivery/` — create shipment, AWB, tracking + webhook handler
10. `lib/whatsapp/` — send template, delivery receipt logging + webhook handler
11. Admin server actions — split by resource:
    - **Categories:** `getAdminCategories()`, `createCategory(name, slug)`, `updateCategory(id, data)`, `deleteCategory(id)`
    - **Products:** `createProduct()`, `updateProduct()`, `deleteProduct()`, `updateVariantStock()`
    - **Orders:** `getAdminOrders()`, `updateOrderStatus()`, `getOrderDetail()`
    - **Inventory:** `getInventory()`, `adjustStock(variantId, delta, reason)`
    - **Coupons:** `createCoupon()`, `updateCoupon()`, `deleteCoupon()`
    - **Banners:** `getBanners()`, `createBanner()`, `updateBanner()`, `deleteBanner()`
    - **Collections:** `createCollection()`, `updateCollection()`, `addProductToCollection()`
    - **Reviews:** `getAdminReviews()`, `updateReviewStatus(id, status)`

---

## What Sam Must Build for Dynamic Categories to Work

This is the minimum backend needed before Vismaya can build the navbar and homepage correctly.

### Priority 1 — Wire `getCategories()` (do this before Vismaya starts navbar)
File: `lib/actions/products.ts` — replace the stub with a real DB query:
- `getCategories()` → fetch all categories ordered by `sortOrder`
- Call `revalidatePath("/")` whenever a category is created/updated/deleted so the homepage refreshes automatically

### Priority 2 — Admin Categories CRUD (so client can self-manage)
File: `lib/actions/admin/categories.ts`:
- `getAdminCategories()` — list all categories
- `createCategory(name, slug, sortOrder?)` — insert + revalidate
- `updateCategory(id, data)` — update + revalidate
- `deleteCategory(id)` — delete + revalidate

All admin actions must be guarded with `requireAdmin()` so only logged-in admins can call them.

### Dynamic categories rule (architectural — enforce in PR review)
Wherever categories appear on the storefront (whatever sections Vismaya designs), the names + slugs must come from `getCategories()`. No hardcoded "Dresses" / "Tops" strings anywhere — not even as fallbacks. This is what makes the admin self-service promise actually work.

---

## Product Tag / Label Printing (Admin Feature)

The client uses pre-printed branded hang tags (design already done). For each product/variant added in admin, a small dynamic label needs to be generated and printed to stick onto the hang tag.

**Why it can't be bulk-printed:** every variant has unique details (size, price, SKU, fabric) — labels must be generated from the DB per product.

**The flow:**
1. Client adds product + variants in admin
2. Admin has a **"Print Tags"** button per product (and bulk print for all variants)
3. System generates a PDF label with all product details
4. Client prints on Xprinter XP-365B using a smaller label roll (50×30mm or 2×3 inch)

**What Sam must build:**
- PDF label generator in admin panel (per variant + bulk)
- "Print Tags" button on the admin product detail page
- Label content: Product name, Size, MRP (₹), SKU/barcode, Fabric composition, Care instructions, HSN code (6211)

**Required fields to add to the admin product form:**
- Fabric composition (e.g. "100% Linen")
- Care instructions (e.g. "Dry clean only")
- MRP — separate from selling price (important if product is on sale/discount)

**Legal requirement — Legal Metrology Act (India):**
Garment labels must show MRP, manufacturer details, fabric composition, size, and care instructions. This is a compliance requirement, not optional. All these fields must be captured in the product form and printed on the label.

**Printer:** Xprinter XP-365B — same printer as shipping labels, just swap to a smaller label roll for hang tags.

**Barcode standard — Code 128 (decided, not EAN-13):**
- Use **Code 128** generated from the existing `sku` column. Free, no registration, alphanumeric, encodes the SKU as-is. Scans on any reader.
- Library: **`bwip-js`** (MIT, ~50KB) — generates Code 128 as PNG/SVG, embed in the hang tag PDF.
- No schema changes needed — the SKU IS the barcode.
- Client also needs a **basic USB/Bluetooth barcode scanner** (~₹800–2,000 on Amazon) for inventory counts and returns processing. Any model that reads Code 128 will work.

**EAN-13 deferred — only register with GS1 India if/when client expands to marketplaces:**
- Required by Myntra, Amazon, Ajio, Nykaa, Flipkart and physical retail chains. NOT required for direct-to-consumer launch.
- Cost: ~₹38K first year (₹28K one-time allocation for 1,000 codes + ₹4K annual sub for <₹50L turnover + 18% GST), then ~₹5K/year recurring. Recurring renewal is annual; missing it makes codes inactive for marketplace verification.
- When the trigger hits (client wants to list on a marketplace), it's a one-day job to register + add an `ean13` column to `product_variants` + print both barcodes on the hang tag.
- Source for current pricing: https://www.gs1india.org/services/registration/ (verify before quoting client).

---

## Risks to Watch (July 20 deadline)

- **Product photography — STATUS UNKNOWN as of Jul 4.** If the shoot hasn't happened, this alone can sink Jul 20. Chase daily.
- **Meta template approval (1–7 days)** — templates not yet submitted; every day unsubmitted eats buffer
- **Interakt API-key access blocked** ("connect mobile number", 24h wait) — with Vismaya + support ticket
- Razorpay live webhook secret can only exist after deploy — deploy early, don't stack this to the last week
- Admin CRUD is the content bottleneck — nothing can be entered until Vismaya's forms merge
- Never run casual checkout tests once live Razorpay keys are active — real money moves
