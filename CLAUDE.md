# Aarna — Claude Context

This file is read automatically at the start of every Claude session in this project.
Do not delete it.

---

## What This Project Is

Aarna by Arpitha Abhishek — a women's indo-western fashion e-commerce platform.
Built by Solaris Studios. India-only, English, INR, online payments only (no COD).
Fixed price: ₹1,30,000. Timeline: 10–12 weeks. Currently in Week 1.

**Launch scope (confirmed by client):**
- 16 products at launch
- 2 categories at launch: **Dresses** and **Tops**
- Long-term vision: client self-manages everything via admin (categories, products, collections, banners, coupons) — zero developer involvement needed after handover

**Critical architecture rule:** category names must always come from `getCategories()` — never hardcoded as strings anywhere in the codebase (not even as fallbacks). When the client adds a new category via admin, it must appear automatically wherever categories are displayed.

**Frontend design direction is fully Vismaya's call** — palette, typography, brand voice, layout, copy, section structure. Client has approved her direction. The only frontend constraint is the dynamic-categories rule above.

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

- [ ] **Razorpay webhook secret** — Razorpay dashboard has a platform outage (2 days+); add `RAZORPAY_WEBHOOK_SECRET` once dashboard is back
- [ ] Delhivery KYC — client confirmed Delhivery, start onboarding
- [ ] WhatsApp BSP (Interakt) — waiting for client's Facebook Business Manager + spare phone number. Scope locked to 4 key-milestone templates; drafts ready in `docs/whatsapp-templates.md` (submit to Meta once Interakt account exists). `sendTemplate()` + trigger points still to wire once the API key lands.
- [ ] Resend account + DNS verification for `hello@aarna.in` (and `hello@solarisstudios.co.in` for testing)
- [x] Cloudinary — account connected, keys in `.env.local`; `lib/cloudinary/` signed-upload helper done and verified live (upload → fetch metadata → f_auto/q_auto transform → destroy all OK)
- [ ] Mood board approval from client in writing — needed to trigger ₹52K milestone payment
- [ ] Priority 2 — Auth & Account:
    - [x] `lib/actions/auth.ts` — signup/login/logout/reset password (Supabase Auth)
    - [x] `lib/actions/account.ts` — orders, wishlist, addresses, returns
    - [x] `middleware.ts` — Supabase session refresh + `/admin` & `/account` redirects. Admin RBAC is enforced in `app/admin/layout.tsx` via `getCurrentAdmin()` (Drizzle can't run in edge middleware, so the admins-table check lives in the server-component layout)
    - [ ] Supabase Auth email templates wired to Resend
    - [x] RLS policies — `lib/db/rls.sql` (default-deny on all 20 public tables; apply with `npm run db:rls`). Applied + verified on aarna-dev (anon REST now returns 0 rows). Server actions use the Drizzle owner role which bypasses RLS; this only locks the public PostgREST/anon surface. **Re-run `npm run db:rls` on the prod project before go-live.**
- [ ] Priority 3 — Integrations: `lib/delhivery/` (client + serviceability + webhook done; shipment creation/tracking stubbed pending KYC token), `lib/whatsapp/` (stubbed — blocked on BSP)
- [ ] Priority 4 — Webhooks: Delhivery webhook wired (status → fulfillment_status); Razorpay `payment.failed` + `refund.processed` now handled (refund flips order status + emails customer). Implement live Delhivery shipment creation + tracking once the KYC API token is set
- [x] Priority 5 — Admin server actions (categories, products, orders, inventory, coupons, banners, collections, **reviews**) + product hang tag PDF generator

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
- ₹52,000 — on mood board/design approval (get written confirmation from client NOW)
- ₹39,000 — on go-live (Week 12)

---

## Immediate Next Steps for Sam

1. Get mood board approval from client in writing → triggers ₹52K payment
2. ~~Submit Razorpay KYC~~ — done, test keys live
3. Add `RAZORPAY_WEBHOOK_SECRET` to `.env.local` once Razorpay dashboard outage is resolved
4. Start Delhivery KYC — client has confirmed Delhivery as shipping partner
5. WhatsApp BSP — waiting on client (Facebook BM + spare number). Scope locked + 4 templates drafted (`docs/whatsapp-templates.md`); submit to Meta once the Interakt account exists
6. ~~Seed the DB~~ — already done (Dresses + Tops live in Supabase)
7. ~~Wire Priority 1 server actions~~ — done (products, cart, checkout)
8. ~~Build Priority 2~~ — auth, account, middleware/RBAC, RLS all done. **Remaining:** Supabase Auth email templates wired to Resend
9. Resend account + verify `hello@aarna.in` DNS so emails actually send
10. ~~Cloudinary~~ — done (account connected, keys in `.env.local`, verified live)

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

## Risks to Watch

- WhatsApp BSP onboarding + Meta template approval — start day 1, not week 4
- Product photography — lock shoot date with client immediately
- Razorpay activation delay — KYC submitted is not KYC approved
- Staying ahead of Vismaya on server actions — she builds fast with AI
