# Aarna — Claude Context

This file is read automatically at the start of every Claude session in this project.
Do not delete it.

---

## What This Project Is

Aarna by Arpitha Abhishek — a women's indo-western fashion e-commerce platform.
Built by Solaris Studios. India-only, English, INR, online payments only (no COD).
Fixed price: ₹1,30,000 (+₹18,000 hang-tag change request → ₹1,53,000 revised).
**Original hard deadline was July 20, 2026; that slipped. Current plan (confirmed Jul 24): site goes public Monday July 27, ordering opens Wednesday July 29 at 11:00 AM IST exactly — see CURRENT STATUS below.**

**Launch scope (confirmed by client):**
- **11 products at launch** — revised down from the originally-planned 16 (client decision, Jul 24). All 11 verified complete: 5 variants, images, fabric, wash care, MRP each.
- 2 categories at launch: **Dresses** and **Tops**
- Long-term vision: client self-manages everything via admin (categories, products, collections, banners, coupons) — zero developer involvement needed after handover

**Critical architecture rule:** category names must always come from `getCategories()` — never hardcoded as strings anywhere in the codebase (not even as fallbacks). When the client adds a new category via admin, it must appear automatically wherever categories are displayed.

**Frontend design direction is fully Vismaya's call** — palette, typography, brand voice, layout, copy, section structure. Client has approved her direction. The only frontend constraint is the dynamic-categories rule above.

---

## 🚨 CURRENT STATUS — July 24, 2026 (two-phase launch: public Mon Jul 27, ordering opens Wed Jul 29 11:00 AM IST)

**THE APP IS DEPLOYED: https://aarna-gamma.vercel.app** (Vercel, Sam's account `sam1512-tech`, project `aarna`, Hobby plan). Auto-deploys on every merge to `main`. **Full-scope audit completed Jul 4** (27 checks); **admin CRUD + reviews closed out Jul 7**; **coupon bug, Razorpay key rotation, tag printing shipped Jul 8**; **deployed + 12-PR Vismaya batch merged + all 4 WhatsApp templates approved Jul 8–10**; **second full code audit Jul 11** (see below); **Vismaya's 5-branch polish batch + cart-badge follow-ups merged Jul 15**; **cart bug-fix batch + PDP fixes Jul 16**; **round-2 full audit (77 findings) + all 3 critical + all 17 high-severity fixes merged Jul 22–23**; **round-3 batch — 22 PRs covering the medium-severity backlog, the pre-launch coming-soon gate, and a critical Google OAuth bug — merged Jul 23–24** (see below). State of the world:

### Two-phase launch plan (decided Jul 24) — public site vs. ordering are now separate milestones
Client mandate: the site needs to be **publicly live Monday July 27**, but **ordering shouldn't actually open until Wednesday July 29 at 11:00 AM IST**. There was no existing mechanism to have the site up without checkout working, so one was built — see "Pre-launch coming-soon gate" below. This is now the primary framing for everything remaining: anything gating Monday is a code/content problem (Sam's or Claude's to fix); anything gating Wednesday is almost entirely external-dashboard work only Sam can do (live Razorpay keys + webhook, DNS cutover to shopaarna.in, prod Supabase decision).

### Round-3 batch — 22 PRs, parallel dispatch + adversarial review (Jul 23–24, PRs #214–#241)
Continuation of the round-2 audit's 36 medium-severity findings. Per Sam's explicit instruction to stop fixing one-by-one, ~20 findings were dispatched **in parallel** to independent Workflow agents (each in an isolated git worktree), producing 20 real PRs in one pass, then the 5 highest-risk (money/race/schema) PRs were put through a second adversarial-review pass (independent reviewer agents specifically trying to refute each "verified" claim). **That adversarial pass caught 4 genuine, would-have-shipped bugs that self-reported "verified" implementations had missed** — validating that self-reported verification isn't sufficient for financially-sensitive code:
- **`#216`** (DB constraints/indexes) — a follow-up fix was needed in `mergeGuestCartOnLogin`'s cart-creation branch, which didn't match the `onConflictDoNothing` race-safety pattern already used in its sibling branches.
- **`#218`** (coupon perCustomerLimit) — the original enforcement had a TOCTOU race under concurrent checkouts; fixed with a `pg_advisory_xact_lock` scoped to `customerId:couponCode`.
- **`#220`** (order-actions concurrency) — `createDelhiveryShipment`'s final success-write was unconditional; tightened to a conditional UPDATE guarding against a shipment being cancelled mid-creation, with an admin alert if the guard ever fires (real shipment booked externally, DB write lost).
- **`#224`** (refund/invoice fixes) — the most severe: a coupon TOCTOU race, a coupon-budget-spent-by-never-paid-orders bug, a duplicate-webhook invoice-number mismatch, and `buildInvoiceData` using `new Date()` instead of `order.placedAt` on reprints. **The adversarial review caught a real regression in the first draft**: the idempotency guard as first written would have let a replayed webhook resurrect an already-*refunded* order back to `paid` — tightened to only allow `pending`/`failed` → `paid`.
- **`#232`** (statement-timeout on categories query) — not a bug, but confirmed the review's "worth fixing" item was actually unfixable at the call site: postgres.js's `Query.cancel()` discards its own cancellation promise internally (confirmed by reading the installed driver source directly), so no caller can ever `.catch()` a failure there. Shipped as an honest doc-comment instead of a fake fix.
- **A genuine gap in the dispatch itself**: task #12 ("prevent duplicate same-size variants when color is unset") was planned for the DB-constraints batch but got left out of the actual agent prompt — caught afterward, fixed separately as `#235` (`product_variants`' unique index tightened to `NULLS NOT DISTINCT`, Postgres 15+; also found and cleaned up one real pre-existing duplicate in the dev DB from manual test data entry).
- **Merging 22 PRs into a fast-moving `main` produced 6 real conflicts**, not just mechanical ones — each was actually read and resolved on its merits (e.g. `#217`'s photo-URL validation vs `#216`'s race-safety insert both touching the same function; `#221`'s SKU-retry refactor vs `#235`'s new constraint both touching `createVariant`, resolved by wiring the new constraint into the retry helper rather than picking one side).
- **`#236`** — signup silently failing when Supabase requires email confirmation (redirect into a protected page with no session, looked like a silent bounce) — opened by **Dhanush** (GitHub `Venomics14`), a friend of Sam's helping out informally on backend work. Reviewed independently (including a live empirical test proving the login error-message fix doesn't leak account existence) before merging.
- **`#234`** — `verifyPaymentSignature` was missing the same `timingSafeEqual`-throws-on-length-mismatch guard already applied to `verifyWebhookSignature`; turned out to be dead code (zero callers anywhere), fixed anyway for consistency.
- Merge convention used throughout: `gh pr merge <N> --admin --squash` — `main` requires 1 approval, and admins-exempt doesn't bypass that on a plain merge in practice, `--admin` is the actual working override. See "Git Workflow" below.
- **PR #160** (Vismaya's mobile-PDP-gallery-arrow fix, open since Jul 19) closed as obsolete — the whole `GalleryArrow`/`ImageLightbox` system it patched no longer exists on `main`, superseded by a swipe-only mobile gallery redesign in an unrelated change.
- **Still open from the original 77-finding audit:** 21 low-severity findings, not yet started.

### Pre-launch coming-soon gate (Jul 24, PRs #237, #238)
Built to bridge the "public Monday, ordering Wednesday" gap. New `lib/launch-gate.ts`: every storefront route rewrites to `/coming-soon` (a live countdown to `ORDERING_OPENS_AT`) until that instant passes; `/studio` and `/api` are never gated. `/?preview=<PREVIEW_ACCESS_SECRET>` sets a 30-day bypass cookie for Sam/Arpitha to see the real site throughout.
- **A real lockout bug was caught live before shipping**: the first version didn't exempt `/login`, but `/studio`'s own unauthenticated-redirect goes through `/login` — meaning the gate would have silently locked admin out of the whole panel for the entire gated window. Caught specifically because a real browser (which follows redirects) was used to verify, not `curl` without `-L` (which doesn't, and looked like a pass).
- **Both new env vars are deliberately NOT `NEXT_PUBLIC_`** — that class gets inlined into the JS bundle at build time, so changing the launch date would otherwise need a full rebuild instead of just a Vercel env-var edit + redeploy. The coming-soon page (a server component) reads the var and passes it to the client countdown as a prop, so the client never needs to read it directly. Verified live: the same build responds correctly to the env var changing with no rebuild.
- Fails open on both missing config and an already-past date — never an accidental lockout of the real launch.
- **Still needs Sam to activate**: set `ORDERING_OPENS_AT=2026-07-29T11:00:00+05:30` and `PREVIEW_ACCESS_SECRET=<random>` in Vercel production, then redeploy. Code is merged but inert without this.

### Google sign-in was broken for every real customer — found + fixed Jul 24
Reported as "goes to Google, picks an account, comes back to the site, not signed in" — for every Google account except `aarnabyarpithabhishek@gmail.com`. Two stacked, unrelated bugs, found in sequence:
1. **Google Cloud Console's "Authorized JavaScript origins" was missing the production domain** (dashboard-only, fixed by Sam) — this was blocking the OAuth handshake from ever completing. The OAuth client was also fully recreated (new Client ID/Secret) as part of debugging this.
2. **Underneath that, `/auth/callback` never created a `customers` row for a first-time OAuth or email-confirmation sign-in** — `login()` (password/OTP) has always had this exact defensive fallback (`onConflictDoNothing`, matching an older edge case), but the OAuth callback route never did. `exchangeCodeForSession` succeeded fine (real Supabase session, real cookie) but `getCurrentCustomer()` then found no matching row and returned `null` — so `/account` and everything else gated on "is there a customer" silently rendered as signed-out, no error at all. Arpitha's account only ever "worked" because it already had a row from unrelated prior testing — every other Google account, ever, would have hit this. **Fixed in `app/auth/callback/route.ts` (PR #241)** — same `onConflictDoNothing` pattern, safe to run unconditionally (a guaranteed no-op on the email-confirmation path, since `signup()` already creates the row there). Also added the guest-cart merge on this path, matching every other sign-in method. Verified live against the dev DB (reproduced the exact broken state, confirmed the fix, confirmed idempotency) and live on production with a fresh Google account after deploy.

### Reliability + auth hardening batch — Jul 24 (PRs #244–#248, all merged + live in prod)
Each live-verified against the real dev DB (not just tsc/build) and each deployed to production successfully. In merge order:

- **`#244` — `/studio/inventory` now releases expired checkout holds on page load.** `initCheckout` atomically reserves (decrements) stock at checkout *start* to prevent overselling, held for `CHECKOUT_HOLD_MINUTES` (20 min) and released by `releaseExpiredCheckoutHolds()`. That release runs inline on the next *new* checkout (fine under traffic) and via a daily cron — but Vercel **Hobby caps cron at once/day**, so during a quiet period an abandoned hold could sit reserved for hours with nothing to release it, and the admin's inventory page would show stale-low stock. Interim stopgap: the inventory page calls `releaseExpiredCheckoutHolds()` on load (same proven-safe function, never blocks the page on failure) so the one page built to show real counts always does. Remove once Vercel Pro is active and the cron can run frequently (Sam deferred Pro to "a day or two" — Jul 24).

- **`#245` — Delhivery `createShipment()` now validates the response body, not just HTTP status.** `/api/cmu/create.json` can return HTTP 200 while reporting a per-shipment rejection in `packages[0].remarks` (bad pincode, serviceability) — the forward-shipment path trusted HTTP success alone and would silently save a fake AWB, marking an order "shipped" with no real shipment behind it. Now matches `requestReversePickup()`'s existing validation and returns the Delhivery-confirmed waybill. **Live-test footnote:** verifying this created a real test shipment on the *production* Delhivery account (waybill `55173410000055`, garbage test data, order ref `AARNA-001023`) — I wrongly assumed a reused order ref would be rejected; Delhivery just manifested a new shipment. Two cancel attempts via `/api/p/edit` failed ("Incorrect Waybill/OrderID", indexing lag). Harmless (fake address → will RTO), but it's clutter in the Delhivery dashboard if not manually cancelled. Note Sam *also* has a real legitimate pickup for `AARNA-001023` — Delhivery does NOT dedupe order refs, it creates a new shipment every call (which is exactly the blind-trust the fix guards against).

- **`#246` — auth hardening audit, 9 fixes.** Triggered by a full re-audit of the auth surface. **The headline is structural: `getCurrentCustomer()` now SELF-HEALS a missing `customers` row.** The #241 Google bug was one instance of a whole class — every sign-in path had to individually remember to mirror the auth user into `customers`, and any that forgot rendered the user silently signed-out. Now a valid Supabase session with no row gets the row created lazily on the next page load (`onConflictDoNothing`), so the class is closed: any future auth path that forgets the mirror is repaired automatically, not left broken. The other 8: **resend-verification built end-to-end** (`resendSignupConfirmation`, rate-limited) — an unverified account was previously a dead end on both the login form and the post-signup panel; **signup confirmation email was mislabeled** — the hook rendered the OTP block with subject "Your Aarna login code: 123456" for what is actually a click-the-link confirmation, now renders the (previously dead-code) confirm-email template with subject "Confirm your email — Aarna" (**needed a redeploy to take effect — #248's deploy provided it**); **`/login/otp` `?next=` open redirect closed** (now runs through `safeRedirectPath` like `/login`/`/signup`); **password-reset requests rate-limited** (the one email-triggering action that wasn't); **`logout()` scoped to `local`** (was Supabase's default `global` — signing out on a phone logged you out on your laptop); **`/auth/callback` no longer 500s on a DB hiccup** mid-sign-in (session cookie's already set; a missed mirror is caught by the self-heal above); **login redirect preserves the query string** (`/account/orders?page=2` no longer drops to page 1); confirm-email template's "24 hours" corrected to Supabase's real 60-min token lifetime. Scope deliberately kept tight for the launch window — Supabase's managed password/JWT/PKCE internals were NOT touched (that managed setup *is* the industry-standard); every real auth bug this project has ever had lived in the integration layer (callback routes, redirects, email hook, config), which is where the audit went deep.

- **`#247` — new-user signup nudge.** A failed *password* login now shows "New to Aarna? Create an account" under the "Invalid email or password" error. Shown for BOTH wrong-password and no-account (indistinguishable by design — anti-enumeration, so it leaks nothing), and deliberately NOT shown for `email_not_confirmed` (that account exists → the resend affordance is right there instead). Google and OTP sign-in never hit this — both create the account transparently for a new person.

- **`#248` — the pooler-hang-fails-the-build class is now CLOSED (new `lib/db/safe-query.ts`).** The Vercel *production* auto-deploy had failed 3 of the last 4 merges with an identical signature: compiles fine, then static generation times out after 60s on storefront pages and aborts. Root cause: the transaction-mode pooler intermittently hangs a query with no response, and during `next build` Next trial-renders every page — the shared storefront layout's `getCategoriesSafe()` runs on ALL of them, so one hung query there blows Next's 60s per-page budget and fails the entire deploy (that's why even *dynamic* pages like `/payment-failed` showed up in the failures). The old `getCategoriesSafe()` had an 8s timer firing `.cancel()`, but it did `await query` and relied on that cancel *succeeding* to break the wait — when the pooler is distressed enough that `.cancel()`'s own auxiliary connection also fails, nothing settled the query and the render hung the full budget anyway. **The fix: `safeDbRead(promise, {timeoutMs, fallback, label, onTimeout?})` races the read against a timeout that wins UNCONDITIONALLY** (Promise.race), returning the fallback on timeout OR rejection regardless of whether any cancel gets through. Applied to the three build-time-static reads that can hang: `getCategoriesSafe()` (the layout — the actual cause, keeps its raw-`pgClient` `.cancel()` as now-best-effort cleanup via `onTimeout`), the homepage's 5-query `Promise.all`, and the `/collections` list query. A full sweep confirmed those are the ONLY storefront pages that both statically generate and query the DB (everything else is dynamic via cookies/auth/searchParams, or query-free). Verified end-to-end against the real dev DB: a query that genuinely `pg_sleep(30)`s server-side returns the fallback at 8003ms, not 30s; a fast query still resolves in 134ms with no false timeout. **Going forward: any new statically-generated or ISR storefront page that reads the DB at render time must go through `safeDbRead`, not a bare `await` — a bare await can hang the whole build.** This supersedes the older "harden the specific query with a Promise.race" advice that pointed at `getCategoriesSafe()`'s old inline pattern. The merge's production auto-deploy then succeeded cleanly on the first try — the fix testing itself.

### Round-2 audit — every critical and high finding fixed (Jul 22–23, PRs #196–#211)
A follow-up "find everything, literally everything" audit produced 77 findings (3 critical, 17 high, 36 medium, 21 low) across a 13-dimension review, each independently re-verified against real code (round 1 had produced 6 false positives from a workflow reading the wrong git worktree — round 2 fixed that by having every agent self-verify its `git log` before reading anything). Full report: see the audit artifact referenced in session history. **All 3 critical + all 17 high findings are now fixed and merged, one PR at a time, each with live verification against the real dev DB or a real running server — not just tsc/build.** Medium (36) and low (21) findings are still open. In order merged:
- **`#196`** — `markReturnQc` double-refund race (a double-click could refund a customer twice) fixed with a row-locked transaction + conditional write; bundled the `partialPercent` bounds check (was trusted from the client with no clamp, could 500%-overrefund).
- **`#197`** — the 7-day stale-unpaid-order cleanup cron now re-verifies against Razorpay before deleting anything (previously trusted the DB's own `paymentStatus`, which could be wrong if a webhook silently failed) — holds ambiguous orders for manual review instead of guessing.
- **`#198`, `#199`** — this project had zero automated tests. Added vitest (Node-only, no jsdom yet), unit tests for `calculateOrderGst`/`isInterStateOrder` and the invoice PDF math; bumped Next 16.2.6 → 16.2.11 (patches 9 disclosed advisories incl. a middleware/proxy auth-bypass and Server Actions SSRF).
- **`#200`** — closed a real open-redirect: `next.startsWith("/") && !next.startsWith("//")` didn't catch a backslash (`/\evil.com`), which the WHATWG URL parser treats as `//evil.com` for http(s) — independently reproduced with a raw Node script before fixing.
- **`#201`** — CSV/Excel formula injection in the admin sales/GST reports export (a customer's shipping name like `=HYPERLINK(...)` would execute as a live formula when the export opened in Excel) — standard OWASP `'` prefix mitigation.
- **`#202`** — `verifyEmailOtp` had zero rate limiting on guessing the 6-digit code (only `sendEmailOtp` limited *requesting* one) — this app's primary login is passwordless OTP, so this was a real account-takeover path. Live-verified through the actual login UI: attempts 1–10 rejected normally, 11 hit the rate limit.
- **`#203`** — bundled 4 related findings on the `payment.captured` webhook: a coupon TOCTOU race (two simultaneous checkouts could both redeem a `usageLimit=1` coupon), a coupon budget spent by checkouts that never paid (was decremented at order-creation, moved to the webhook), a duplicate-webhook invoice-number mismatch (`markOrderPaid` now a guarded conditional UPDATE with the invoice number generated *inside* the same guarded statement, closing a residual invoice-sequence-gap an adversarial review caught), and `buildInvoiceData` using `new Date()` instead of `order.placedAt` for reprints. **A 3-agent adversarial review of the first draft caught a real regression before merge**: the guard as first written (`paymentStatus <> 'paid'`) would have let a replayed webhook resurrect an already-*refunded* order back to `paid` — tightened to only allow `pending`/`failed` → `paid`.
- **`#204`** — a failed invoice PDF/email after a successful payment could never retry (the idempotency pre-check skips reprocessing a "paid" order) — wrapped in its own error handling that alerts an admin, and added a "resend confirmation email" button on `/studio/orders/[orderNumber]` since there was previously no recovery path at all.
- **`#205`** — `shippingAddress` was never validated server-side in `initCheckout` (only in the browser) — a malformed address (missing `state`) crashed `buildInvoiceData`, confirmed live while verifying #204. New `lib/checkout/address-schema.ts`; also hardened `regenerateInvoicePdfBatch` so one bad order doesn't fail an admin's entire batch-print selection.
- **`#206`** — the homepage went fully static as a side effect of the cart-badge fix (`#190`), so a scheduled banner's `startsAt`/`endsAt` could silently miss its window with no admin action to trigger a refresh — `export const revalidate = 60`.
- **`#207`** — Delhivery RTO (return-to-origin) shipments never restocked inventory. **First draft auto-restocked, mirroring the manual-cancel pattern — Sam caught a real product-logic gap: an RTO parcel has been through transit and a failed delivery attempt, so it can come back damaged, and auto-restocking risks shipping a damaged item to the next customer with nobody having inspected it.** Redesigned to alert an admin for manual inspection instead of auto-restocking — same "flag a human, don't guess" principle as `#197`.
- **`#208`** — an exchange could pass QC with nothing to actually ship if the desired replacement variant sold out during the (sometimes 24h+) approval window — `markReturnQc` now re-checks stock at the actual commitment moment (QC pass) and blocks with a clear message; the admin returns queue also now shows the desired variant + live stock for every exchange.
- **`#209`** — 5 of 6 admin list pages (orders/coupons/inventory/reviews/returns) rendered a static "page X of Y" with no clickable pagination — only `/studio/products` had it right. Extracted into `components/admin/pagination.tsx` + `lib/admin/pagination.ts`, wired into all 6.
- **`#210`** — the auto-submit admin filters (`AutoSubmitForm`) fired a full page reload on *every* arrow-key press in a `<select>`, not just the final choice (native closed-select platform behavior) — debounced selects by 400ms; checkboxes stay instant.
- **`#211`** — `main` had zero branch protection (verified via a direct `gh api` call — 404, not protected) despite CLAUDE.md documenting it as intended policy, and no CI at all. Added `.github/workflows/ci.yml` (lint/typecheck/test — **not** `build` yet, since that needs Supabase secrets in GitHub Actions, which only Sam should add) and enabled real branch protection: 1 required approval, the new CI check required, no force-push/deletion, admins exempt from the approval requirement so the existing solo-merge workflow is unaffected.

**Medium findings: DONE as of Jul 23–24** — see the "Round-3 batch" section above (22 PRs). **Still open:** 21 low-severity findings, not started. Bot/WAF + CAPTCHA still blocked on a Cloudflare/Turnstile account only Sam can create (see Jul 22 section below). CI doesn't run `npm run build` yet — needs `DATABASE_URL`/Supabase secrets added to the repo's GitHub Actions secrets first.

### Admin panel moved from `/admin` to `/studio` (Jul 22)
Client asked whether the admin panel could be reached somewhere less obvious than `/admin`. The real security is unchanged and was never resting on the URL — `/studio` still requires a valid Supabase session **and** a row in the `admins` table (`app/studio/layout.tsx`), enforced server-side on every request, plus every admin server action independently calls `requireAdmin()`. This rename is purely to cut down on bot/scanner traffic hitting the login page, not a substitute for that. Also: `robots.ts` no longer lists the admin path in its `disallow` rules (a public robots.txt naming an "obscure" path defeats the purpose) — `/studio` instead carries its own `robots: {index: false, follow: false}` metadata. **Only `app/admin/` → `app/studio/` moved** — internal folder names (`lib/actions/admin/`, `components/admin/`) and the `/api/admin/*` routes are unchanged, since those aren't publicly discoverable the way a browser-typed panel URL is.

### Security hardening batch opened Jul 22 (4 PRs — #181, #183, #184, #186)
Follow-up to a broader "what security can we add" discussion. Two items from that discussion — bot/WAF protection and CAPTCHA on login/signup — are **not implemented**: both require creating a new third-party account (Cloudflare, Turnstile/hCaptcha) that only the client/Sam can set up. Everything else was buildable in code:

- **`#181` — security response headers.** `next.config.ts`'s `headers()` now sets a real CSP (allowlisting exactly Razorpay's checkout.js/`*.razorpay.com`, Cloudinary images, and the Supabase project URL — every host checked against actual runtime usage, not guessed), `frame-ancestors 'none'` + `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy`. Nothing beyond Vercel's default HSTS existed before. Verified against a real production-mode build in a browser (homepage, login incl. Google button, a PDP with Cloudinary images, and the Razorpay script itself) with zero CSP violations. `#180`'s "use server" type-re-export build break was hit and fixed as a byproduct of chasing what turned out to be an unrelated CI failure on this PR.
- **`#183` — Postgres-backed rate limiting.** New `rate_limit_attempts` table (fixed-window counters); Postgres rather than in-memory because Vercel functions are ephemeral/multi-instance and an in-memory counter wouldn't coordinate a burst across them. Applied to login (10/15min by email + 20/15min by IP), OTP send (5/15min by email + 10/15min by IP), signup (5/hour by IP), coupon-apply (20/10min by IP). Fails open on DB errors — a rate-limit hiccup must never lock out a real customer. Cleanup rides the existing daily cron rather than adding a second one. Verified live: 11 wrong-password login submissions in a browser correctly allowed 10 and blocked the 11th with a real UI message.
- **`#184` — admin action audit log.** New `admin_audit_log` table + `logAdminAction()` (a plain module, not a server action, called from within ~35 mutation call sites across all 9 admin resources — products/categories/coupons/banners/collections/orders/returns/reviews/inventory). Fails open, same reasoning as the rate limiter. Simple filterable list at `/studio/audit-log`. The mechanical per-file instrumentation was done via parallel subagents given precise specs, then reviewed directly (full tsc/eslint/build + manual read of the trickiest placements) before verifying the actual logging mechanism against the real DB.
- **`#186` — suspicious-activity email alerts**, stacked on `#183` (extends `rate-limit.ts` directly — merge order matters, this one after/with `#183`, not independently). `checkRateLimit()` gained an optional `alertLabel` that emails every admin (queried from the `admins` table, not hardcoded) the *first* time a limit is actually breached, not on every subsequent blocked request — enabled only on login/OTP (account-takeover risk), deliberately not signup/coupon-apply (lower stakes, more false-positive-prone). Separate from the 4-template customer-facing `sendEmail()` by design — this is an internal ops notification, not a customer touchpoint.

**Still open / needs your call:**
- Bot/WAF protection and CAPTCHA — blocked on creating a Cloudflare/Turnstile account (see above).
- The npm audit findings from adding `exceljs` (reports feature) are still present — re-checked, no new safe fixes available; all four remaining ones (esbuild/drizzle-kit, pdfjs-dist/`@types/react-pdf`, postcss+sharp via Next's own internal copy, uuid via exceljs) require breaking downgrades (drizzle-kit 0.18.1, Next 9.3.3, exceljs 3.4.0) for issues that aren't reachable in this app's actual runtime — documented, not fixed. Worth a periodic re-check as upstream releases patched versions.

### Cart badge decoupled from the storefront layout — static rendering restored (Jul 22, `#190`)
Follow-up from a "launch spike and scaling" discussion — first lever picked was undoing the exact trade-off documented in the (now superseded) "Merged Jul 15" section below: `getCart()` read the guest-cart cookie directly in `app/(storefront)/layout.tsx` just to hydrate the header's cart badge, and any dynamic-API read in a shared layout forces **every nested page** onto per-request dynamic rendering — homepage, PLP, PDP, legal pages, all of it, over one badge number.

- **The fix:** `SiteHeader` no longer takes a server-fetched `initialCartCount` prop. It now hydrates the existing `useCartCount` Zustand store itself, via a client-side call to `getCart()` on mount (the same store every cart mutation already keeps in sync). The layout only calls `getCategories()` now. Confirmed: homepage + `/collections`, `/contact`, `/fabric-care`, `/faq`, `/privacy-policy`, `/return-policy`, `/shipping-policy`, `/terms` flipped from `ƒ Dynamic` back to `○ Static` in the build output, and `next start` now serves the homepage with `x-nextjs-cache: HIT`.
- **Two real Vercel build failures surfaced while shipping this — both fixed, both worth knowing about:**
  1. Making more pages eligible for static generation meant `getCategories()` (called from the shared layout, so it gates *every* storefront page) now runs at **build time** instead of per-request for those pages — and it hit the documented Supabase pooler flakiness during the actual Vercel build, hanging past Next's 60s per-page static-generation timeout and failing the whole deployment. This turned out not to be strictly new: Next attempts a trial render of *every* page during "Generating static pages" regardless of its final static/dynamic classification, so a hung `getCategories()` call could always have taken the whole build down — this was a **latent risk that predated this PR**, just newly triggered by it.
  2. First attempted fix — route build-time DB queries through `DIRECT_URL` instead of the pooler, on the theory that the direct connection is more reliable (per the dev-gotcha below) — made it *worse*: the next build failed outright with `ENETUNREACH`. **`DIRECT_URL` is IPv6-only and Vercel's build machines (`iad1`) have no route to it** — it only works from an environment with IPv6 egress (a local dev machine), which is exactly why the existing one-off `scripts/apply-*.ts` migrations that prefer it are meant to be run manually, never as part of the actual build/runtime path. Reverted; `lib/db/index.ts` is back to always using `DATABASE_URL` (the pooler), full stop — see the new dev-environment gotcha below.
  3. **Actual fix:** `getCategoriesSafe()` in `app/(storefront)/layout.tsx` races `getCategories()` against an 8s timeout via `Promise.race` and falls back to an empty category list on either a rejection or a timeout, instead of letting a hang consume Next's full 60s per-page build budget. `SiteHeader`/`SiteFooter` already render a graceful empty-categories state, and the next `revalidatePath("/")` from any admin category edit fixes a stale/empty result immediately.
- **Not done in this PR (flagged, not forgotten):** `/product/[slug]` (PDP) still builds as `ƒ Dynamic`, but for an unrelated, pre-existing reason — no `generateStaticParams`, so Next server-renders every slug on demand regardless of cookies. PDP is one of the highest-traffic page types under a launch spike, so adding `generateStaticParams` for the 16 launch products is the natural next lever — deliberately scoped out of this PR to keep it reviewable.

### Opened for review Jul 18 (returns v2 — schema merged, actions + UI pending Sam's review)
- **`#142` (schema, merged):** real `type`/`photos`/`qcOutcome`/`rejectionReason`/`adminNote`/`desiredVariantId` columns on `returns`, plus `orders.deliveredAt` — reconciled with Vismaya's parallel schema push. Superseded her original `#138`, which was closed (was actually Sam's own earlier branch, not Vismaya's — corrected from an earlier assumption).
- **`#144` (merged):** P1 unblockers — `categories.imageUrl`/`imageMobileUrl` + an admin upload endpoint (`app/api/admin/uploads/image`, server-side Cloudinary via `lib/cloudinary/upload.ts`), `getNewArrivals({ inStockOnly })`, and `collections.isHomepageFeature` (DB-enforced single-featured-collection via a partial unique index) wired into the homepage.
- **`#145` (open, needs review — NOT auto-merged):** real `updateReturnStatus`/`markReturnQc` actions. Deliberately left for Sam's review rather than self-merged (unlike `#144`) because it wires up **real external side effects on real money/logistics** — `markReturnQc` calls Razorpay `createRefund()` before writing the DB row (so a failed refund never gets silently marked "done"), and approving a return calls `requestReversePickup()` against Delhivery, which per `.env.local` currently points at the **production** endpoint, not staging.
- **`#146` (open, stacked on `#145`, needs review — NOT auto-merged, same reasoning):** wires the customer return/exchange modal (photos, exchange desired-variant picker via `ExchangeVariantChooser`, always sends `type` explicitly now — the old `EXCHANGE_REASON_PREFIX` reason-text hack is deleted) and the admin `/admin/returns` queue (photo grid, a real reject-reason picker, and a QC pass/fail panel once a return hits `received`). Also fixes a real footgun: `"refunded"` was previously a directly-selectable status on the admin dropdown, which would flip a return to "refunded" without ever calling `markReturnQc` — meaning no refund would actually issue despite the row saying so. It's now only reachable through an actual QC pass/fail.
- **Bugs caught during live verification (not just tsc/build) while building `#146`:** a stale-status UI bug (`ReturnStatusSelect`'s local state didn't resync after a sibling QC panel's `router.refresh()` — completed QC passes kept showing the old dropdown instead of a terminal pill; fixed by resyncing from props during render); a Next.js server/client module-boundary bug (exporting a plain constant from a `"use client"` file broke a server-component import at build time — `h.REJECT_REASONS.map is not a function` — moved to a plain shared module, `lib/returns/reject-reasons.ts`); and a silent-failure bug in an early draft of the admin queue (extra count queries hit the known dev-pooler flakiness and a `.catch(() => 0)` showed "0 requests" instead of the real count — reverted to the single-query approach).
- **PR3 (WhatsApp return-flow templates — `return_requested`/`return_approved`/`return_rejected`/`exchange_shipped`/`return_qc_failed`) deliberately NOT built.** Needs real Interakt/Meta dashboard submission with a 1–7 day review cycle that can't clear before Jul 20 regardless, and `#146`'s QC/reject flow already gracefully reuses the existing *approved* `return_received`/`refund_processed` templates for those moments — nothing is blocked without it. Revisit post-launch if per-status granularity is still wanted; would need an explicit scope decision since it expands past the documented "key milestones only" WhatsApp philosophy (4 templates → 9).

### Merged Jul 16 (cart bugs + PDP fixes)
- **Cart coupon discount was stale after changing quantity on `/cart` (#130).** `applyCoupon` computes the discount from the cart's *current* subtotal server-side, but the quantity stepper only ever updated `cart.subtotal`/`total` client-side — a percentage coupon kept showing its pre-change discount until a hard refresh. Fixed by tracking the last-applied code separately from the coupon input's live text (`appliedCode` state) and re-running `applyCoupon(appliedCode)` once a quantity change settles; if the coupon's no longer valid after the change (subtotal dropped below `minOrderAmount`), it's cleared with the same message path manual submission already uses. Verified live: 30%-off `AARNA` coupon on a ₹3,198 cart → discount ₹959.40; bumping quantity to 3 (₹4,797) updated the discount to ₹1,439.10 instantly, no refresh.
- **No feedback when adding a product already in the cart (#130).** PDP now fetches the resolved variant's current cart quantity (`getCart()`, same action `/cart` uses) and shows "N pieces already in your bag" above the CTAs, updating instantly from `addToCart`'s response after a fresh add — no extra round trip. Verified: showed "1 piece already in your bag", then "2 pieces" after clicking Add to bag again, with the header badge updating 1→2 in step.
- **Cart line cards were dead ends (#117) — now link to the product page.** `CartLine` gained a `productSlug` field (from the existing `getCart` join, no extra query); the cart card's thumbnail and title now link to `/product/<slug>`.
- **Guest checkout removed (#116, client decision) — see "Deployed Jul 8" section below** for full detail; this is what made cross-session return/exchange access work at all.
- **Vismaya's cart-total styling merged (#115)** — grand total switched from Cormorant 30px to Karla semibold 18px so it baseline-aligns with the "TOTAL" label. Needed a rebase (her branch was cut before #105 capitalisation touched the same line) — routine going forward: **always `git pull` main before branching**, and rebase any PR that sits open more than a day.
- **PDP fixes opened as #131 (not yet merged as of this writing):** size chips were sorting alphabetically (`ORDER BY size ASC` → L, M, S, XL, XS, XXL) instead of garment order — this wasn't just cosmetic, the *default selected variant* used the same order, so every visitor was silently defaulted into size L on every product. New `lib/sizes.ts` (`sortBySize`) fixes both the storefront and admin queries, matching the admin's existing XS→XXL preset order. Also added: gallery arrow navigation + a position counter on the PDP (previously swipe/thumbnail-only, and the mobile rail didn't track position at all), `touch-action: pan-y` on the mobile gallery rail (a horizontal swipe-carousel nested in a vertically-scrolling page can hijack a not-perfectly-horizontal swipe — the likely cause of "images moving the scroll order" on mobile), and a safe-area-aware bottom offset for the cart page's toast (the layout opts into `viewportFit: "cover"` for the iPhone notch/home-indicator, but nothing previously reserved `env(safe-area-inset-bottom)`, so a fixed-bottom element could sit partly behind the home indicator on iPhone X+). **Merge #131 before considering this batch done.**

### Merged Jul 15 (Vismaya's polish batch #118–#122 + Sam's follow-ups #123–#124)
- **5 Vismaya branches reviewed + merged:** explicit viewport meta w/ maroon themeColor (#118), PDP add-to-bag CTA 48px on mobile (#119), account buttons maroon→cocoa (#120), mobile account sign-out moved to header top-right + nav pills wrap in two rows (#121), **cart count badge on the header bag icon** (#122, new `store/cart-count.ts` Zustand store, server-hydrated via `getCart()` in the storefront layout, synced client-side after every cart mutation). #121/#122 needed conflict resolution against main (they predated #104 no-animations, #105 capitalisation, #98/#100 header simplification) — resolved keeping main's site-wide changes + her structure; resolution merged into her branches, verified with tsc + prod build + live browser checks before merging.
- **Badge trade-off, deliberate:** `getCart()` reads cookies in the storefront layout, so **every storefront page is now dynamically rendered** (legal pages included — previously static). Fine at launch scale with `bom1` pinned; side benefit: no more Supabase statement-timeout flakiness during build-time static generation.
- **#123 — cart is now cleared after successful payment (real pre-existing bug the badge exposed):** checkout snapshots the cart into `order_items` but nothing ever emptied the cart, so the bag (and new badge) kept showing bought items forever. `clearPurchasedCartItems()` (`lib/db/queries/orders.ts`) removes only the ordered variants from the customer's cart, called from the `payment.captured` webhook (failure never breaks payment processing; orders always have `customerId` since guest checkout was removed in #116). `CartCountSync` client component on `/order-confirmation` re-syncs the badge (soft nav never re-runs the layout). Verified with a temp-rows script against the dev DB.
- **#124 — marquee loop made truly seamless:** the earlier fix still jumped ~12px at reset (flex gap adds no trailing gap after the last child + `px-4` lead-in). Each half now wraps its messages with its own trailing `pr-14`; measured in-browser: halves pixel-identical (900.16px each of a 1800.33px strip).
- **4 stale/superseded remote branches deleted** so GitHub stops re-suggesting them: `fe/header-marquee-fix` (equivalent already on main), `fe/404-page` (empty diff), `fe/login-signup-forms` (remainder was lowercase copy, reversed by #105), `fe/login-google-oauth` (main's `/login/otp` already has Google).
- **Benign but startling:** `dotenv` 17.4.2 prints rotating sponsor tips incl. `⌁ auth for agents [www.vestauth.com]` — verified it ships in the official npm tarball (lockfile-pinned), not tampering.

### "Google sign-in + OTP codes not working" on prod — diagnosed + RESOLVED Jul 15 evening
- **OTP emails never send — Supabase Send-Email hook 404s.** Vercel logs showed `[auth] sendEmailOtp error: Unexpected status code returned from hook: 404` — the hook was enabled but still pointed at the pre-deploy placeholder URL. **Fixed (dashboard):** Supabase → Auth → Hooks → Send Email → re-pointed at `https://aarna-gamma.vercel.app/api/auth/email-hook`. Verified live: `POST /api/auth/email-hook → 200` on a real send, no errors. Note `sendEmailOtp` deliberately returns `ok` even on failure (anti-enumeration), so the UI says "check your inbox" while a send is dying server-side — check Vercel logs, not the UI, if this ever regresses.
- **Google sign-in reaches Google fine** (provider + client id + Supabase callback all correct). The failure was after auth: `aarna-gamma.vercel.app` wasn't in Supabase's redirect allowlist, so users bounced to the stale Site URL. **Fixed (dashboard):** Supabase → Auth → URL Configuration → Site URL + Redirect URLs updated to the deployed domain. Verified live via Vercel logs: `/auth/callback` → `/account` → user browsing `/account/exchanges`, `/account/returns` — a clean signed-in session.
- **Supabase OTP length drifted to 8 digits** (project-level dashboard setting, Authentication → Sign In / Providers → Email → OTP Length) while the login form's `LoginOtpView` only has 6 entry boxes. Reset to 6 in the dashboard. **Permanent guard added (#127):** the email hook now warns (length only, never the code) if this setting ever drifts from 6 again — silent before, would otherwise recreate the same break with no signal.
- **Supabase Auth's own send-email rate limit** got tripped during same-day testing (`[auth] sendEmailOtp error: email rate limit exceeded`) — unrelated to the hook, just testing volume. Raised in Supabase → Authentication → Rate Limits → "Rate limit for sending emails".
- **FE bug fixed (#126):** `/login` sent the OTP then handed off to `/login/otp?email=…`, but that page ignored the `email` param and asked for the email again — the just-sent code had nowhere to be typed, and re-sending immediately hit the rate limit above. `LoginOtpView` now takes `initialEmail` and starts at the code-entry step with a 30s resend countdown.
- QA note: throwaway test users from this diagnosis (`aarna-qa-test@…`, `aarna-hookcheck-jul15@…`, `aarna-livecheck2/3-jul15@…`, `aarna-otplen-check-jul15@…`) may exist in Supabase Auth — harmless, delete at leisure.

### "Razorpay doesn't accept payments in test mode" — diagnosed Jul 15 night, RESOLVED by Jul 22
- **Root cause: `RAZORPAY_WEBHOOK_SECRET` is missing from Vercel production entirely** (confirmed via `vercel env ls production` — not in the list at all, unlike `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`NEXT_PUBLIC_RAZORPAY_KEY_ID` which are all present and correct). `verifyWebhookSignature()` (`lib/razorpay/index.ts`) throws unguarded when the secret is unset, and `app/api/webhooks/razorpay/route.ts` calls it with no try/catch — so **every webhook delivery from Razorpay has been crashing before reaching any handling logic**, `payment.captured` included. This has likely been broken since initial deploy — "Razorpay test webhook → deployed URL" was flagged as an unfinished post-deploy step back on Jul 8 and doesn't appear to have been closed out since.
- **Why this looks like "payment rejected":** the Razorpay modal's success `handler` fires client-side, independent of our webhook — so a test card can be fully accepted by Razorpay and the customer still gets redirected through `/payment-processing` → `/order-confirmation`. But the order never flips from `pending` to `paid` (webhook never got through), so the confirmation page shows "we're confirming your order" indefinitely. Presents identically to a real decline from the storefront side.
- **Verified independently that the rest of the checkout flow is correct:** a live test through the deployed app produced a real Razorpay order (`order_TDomFrkCy1TJW8`, ₹2,598) with the correct test key (`rzp_test_TAvw2poEhlUndZ`) embedded in the client payload, the SDK loaded, and a genuine Razorpay checkout iframe mounted pointed at `api.razorpay.com` with a valid session. Couldn't visually confirm the modal's card-entry UI — Razorpay's own bot/risk-detection script (`razorpay-risk-detection/bundle.js`, loaded alongside checkout.js) blanks the modal for automated browsers, which is expected/correct anti-fraud behavior, not a bug.
- **Fix — two steps, both credential entry, need Sam:**
  1. Razorpay dashboard (test mode) → Settings → Webhooks → confirm/create a webhook pointed at `https://aarna-gamma.vercel.app/api/webhooks/razorpay` with events `payment.captured`, `payment.failed`, `refund.processed` — check whether this was ever actually registered, since the code side implies it wasn't.
  2. Copy the resulting secret into Vercel production as `RAZORPAY_WEBHOOK_SECRET`, then redeploy.
- **Also shipped (#128):** `payment.failed` events previously discarded Razorpay's `error_code`/`error_description` entirely — a genuine card decline and this exact webhook-config gap looked identical in logs ("payment failed", no detail). Now logs Razorpay's own reason, so a real decline is diagnosable once the webhook is actually reachable.
- **Left behind:** one test order (`AARNA-001009`, stuck `pending`) and one Supabase auth test user from live-testing this — both cleaned up except the order, which is harmless to ignore or delete via admin.
- **Confirmed fixed Jul 22** (both steps above must have been completed since, though not by this session — no Vercel CLI/dashboard access here to confirm directly). Verified indirectly but conclusively: `verifyWebhookSignature()` still throws unguarded when the secret is unset (code unchanged), so a POST to the live webhook with a *correctly-sized* bogus signature (64 chars — matches a SHA-256 hex digest, so `crypto.timingSafeEqual` doesn't itself throw on a length mismatch) either (a) reaches the real HMAC comparison and returns a clean `401 {"error":"invalid signature"}` if the secret exists, or (b) throws before that point and surfaces as a bare `500` if it doesn't. A control request with a *wrong-length* bogus signature confirmed case (b)'s signature (empty-body `500`) independently. The real test returned case (a) — clean `401` — proving the secret is present and the webhook path is live in production.

### Deployed Jul 8 → performance-fixed Jul 8 (evening)
- **Vercel project:** imported from GitHub `Sam1512-tech/Aarna` under **Sam's** Vercel account (transfer to client at handover). Arpitha's Vercel couldn't be used: her GitHub app installation can't see repos she merely collaborates on (GitHub Apps only see repos owned by the installed account) — importing there would have created a disconnected clone with no auto-deploy.
- **21 env vars set** (all of `.env.local` minus `NODE_ENV`, the live Razorpay keys, and the unused `DELHIVERY_CLIENT_NAME`/`DELHIVERY_MODE`). Bulk-paste into Vercel's env UI corrupts multi-line input (drops characters) — they were entered one at a time and byte-verified. `NEXT_PUBLIC_APP_URL=https://aarna-gamma.vercel.app`.
- **First deploy failed** with a Postgres `statement timeout` during static generation — the documented Supabase pooler flakiness, not code. A plain Redeploy succeeded.
- **"Website lags" fixed:** Vercel functions defaulted to Washington D.C. (`iad1`) while Supabase is in Mumbai — every DB round-trip crossed the planet, so DB-heavy pages had 1.2–3s TTFB. **Function region pinned to Mumbai (`bom1`)** in Project Settings → Functions (Hobby allows exactly 1 region; a new deployment is required after changing it). After: all pages ~120–280ms TTFB. **If prod ever gets mysteriously slow again, check the function region first.**
- **Post-deploy config still NOT done:** Razorpay test webhook → deployed URL, Supabase Auth hook URL + redirect allowlist, Google OAuth origins, Delhivery webhook URL. These block full QA.

### Merged Jul 9–10 (Vismaya's 12-branch batch + follow-ups)
- **9 FE PRs merged** (#85–#94 minus #90): whatsapp-checkbox removal from signup, auth heading caps, return-status label fix (`picked` not `in_transit`), versatility Lucide icons, header logo align, `app/loading.tsx` splash, **exchange flow** (`/account/exchanges` — piggybacks `requestReturn` with `reasonCategory: "exchange"` + an `"Exchange requested."` reason-text prefix, now shared from `lib/exchange.ts`; a dedicated exchange model + outbound swap shipment tracking is Sam's follow-up), admin mobile nav color, admin mobile table scroll. **#90 (faq-page) closed** — it would have replaced the live Aarna-specific FAQ with generic boilerplate. Two branches skipped: `fe/404-page` (stale, empty diff) and `fe/login-signup-forms` (duplicate of #85).
- **Header scroll-blur fix merged twice** (#95 + #96 — #96 was an empty no-op; Vismaya opened duplicate PRs from the same branch). Root cause of the "same PR keeps coming back" confusion: squash-merged branches were never deleted, so GitHub kept re-suggesting them. **Repo setting `delete_branch_on_merge` enabled Jul 10** — branches now auto-delete on merge.
- **All 4 WhatsApp templates are Approved by Meta** and live sends verified end-to-end to two real numbers.

### Full code audit Jul 11 — all fixed and verified
- **`fix/whatsapp-base-url-fallback` was never merged** (sat unmerged since Jul 8) — merged as #97. `??` → `||` so an empty-string `WHATSAPP_API_BASE_URL` falls back to the Interakt default.
- **Dead links killed:** PDP "size guide" → `/size-guide` (route doesn't exist) now points to `/faq` as "size help"; search-page quick picks `/shop/bestsellers` + `/shop/new-arrivals` (404s) replaced with the first two real categories from the `categories` prop (dynamic-categories rule).
- **Sitemap was feeding 404s to Google:** it advertised `/collections` + `/collections/<slug>` — no such routes exist. Removed (restore when the route ships); `/faq` added.
- **`middleware.ts` → `proxy.ts`** (Next 16 deprecation; export renamed `middleware` → `proxy`, `lib/supabase/middleware.ts` helper untouched).
- **Lint 14,800 → 1:** eslint was crawling `.claude/worktrees` (3 stale merged worktrees removed, `.claude/**` ignored); real fixes: props-sync `useEffect` → render-time state adjust in admin inventory table, checkout auto-save `watch()` → subscription form (was re-rendering the whole form every keystroke), unused imports/directives, `argsIgnorePattern: "^_"`. Remaining 1 warning is React Compiler noting RHF's `watch` can't be memoized — inherent to the library.
- **Audited clean:** all admin actions `requireAdmin`-guarded (verified per-function), all 3 webhooks authenticated (Razorpay HMAC, Delhivery shared token, WhatsApp HMAC-when-configured), Razorpay `payment.captured` idempotent, coupon re-validated server-side in `initCheckout`, guest-cart cookie `httpOnly`+`secure`, auth callback open-redirect-safe, `.env.example` covers every env var the code reads, no hardcoded category names anywhere.
- **Return window — RESOLVED Jul 11: 3 days everywhere** (client decision, matching the policy page). Was inconsistent three ways: backend enforced 14, policy page + FAQ said 3, WhatsApp `delivered` template said 7. Now `RETURN_WINDOW_DAYS = 3` in `lib/actions/account.ts`, both account pages, and `app/api/webhooks/delhivery/route.ts`, plus the empty-state copy in the returns/exchanges views. The WhatsApp template passes the window as a variable, so no Meta resubmission was needed.

### Prod error masking fixed Jul 11 evening (Vismaya's "can't add products" blocker)
- **Symptom (video from Vismaya):** clicking Create Product on the deployed admin showed "An error occurred in the Server Components render. The specific message is omitted in production builds…". Root cause was two-layered: (1) Next.js strips the `message` off **every** error thrown from a server action in production builds, so all 120+ friendly validation errors (`Slug "x" is already taken`, `SKU "x" is already taken`, MRP checks, return-window checks…) were invisible on the deployed app — every admin *and* storefront form just showed the masked blob; (2) her concrete failure was `Slug "white-pleated-shirt" is already taken` (Vercel logs) — an earlier attempt had actually **succeeded** (product created 20:04 IST), but since she couldn't see the message she kept retrying into the duplicate-slug error.
- **Fix — `lib/action-error.ts`:** `ActionError extends Error` carries its message in `error.digest` (the one property Next.js forwards to the client unmasked, in dev and prod); `actionErrorMessage(err, fallback)` extracts it in client catch blocks. All user-facing throws in `lib/actions/**` + `lib/labels/` converted (123 sites, incl. `requireAdmin`), all 23 server-action catch sites in admin + storefront forms use the extractor. The 2 tag-print catch sites that wrap `fetch()` to the print route still read `err.message` — those errors are thrown client-side with the route's real message, no masking involved.
- **Convention going forward:** in server actions, user-facing/expected errors must be `throw new ActionError("…")` — a plain `throw new Error` will be masked in prod. Keep plain `Error` for internal/unexpected failures so details stay hidden (that masking is a feature there).
- **Verified in a real production build** (`npm run build && next start` locally): unauthenticated `createProduct` displayed the real "Unauthorized — admin access required" instead of the fallback.

### Bugs fixed + features shipped Jul 8
- **Coupon discount wasn't applied at checkout.** Root cause: the applied coupon (code + discount) only ever lived in `cart-view.tsx`'s local React state — `/checkout` is a separate component with no shared state, so it never knew a coupon was applied. Its total preview ignored the discount and `initCheckout()` was called without `couponCode`, so the customer was charged full price even after "successfully" applying a coupon on `/cart`. Fixed by persisting the applied code to `localStorage` (`lib/cart/coupon-storage.ts`) and having checkout re-validate it server-side (never trusting the stored discount) via the existing `applyCoupon` action, then actually passing `couponCode` into `initCheckout()`. Verified end-to-end with the `AARNA` coupon: cart and checkout both showed the same discount, and the resulting DB order row + Razorpay order amount matched the discounted total.
- **Razorpay test key was dead (401 Authentication failed), independent of any app code.** Root cause: the test API key got silently regenerated when the Razorpay account's live activation completed on Jul 4 (live and test keys were regenerated together, 3 minutes apart, both tagged "New" in the dashboard) — the old test key in `.env.local` was never updated to match. Confirmed via direct `curl` with Basic Auth against `api.razorpay.com` (no app code involved) that the old key 401s and the live key 200s. Regenerated a fresh test key from the dashboard (Account menu → **Enable Test Mode** → Settings → API keys & integration → **Regenerate Key** → "Deactivate old key immediately", required a 2FA SMS OTP) and updated `.env.local`. Current active test key: `rzp_test_TAvw2poEhlUndZ`. Verified a full checkout end-to-end — Razorpay modal opened in Test Mode with the correct discounted amount, and the order got a real `razorpayOrderId`.
- **Dashboard navigation note:** this Razorpay account's redesigned dashboard has no visible Test/Live toggle on the main API Keys page — it's tucked into the profile/account dropdown (top-right avatar) as **"Enable Test Mode"**. Test and Live keys are entirely separate lists, each only revealed once at generation time (no way to view an existing secret again — only regenerate).
- **Admin product sizes/tags rebuilt** (`app/admin/products/[id]/product-edit-view.tsx`). Previously "size" was one free-text field per variant row. Now sizes are independent toggleable chips (presets + custom text) — clicking one adds only that size, never auto-populates the rest — and each size owns its own tags (color+sku+price+stock), addable/editable/removable without touching any other size's tags. No schema change — a "tag" is still just `product_variants.color`, grouped and labeled per size in the UI.
- **Tag printing is now quantity-aware + selectable**, and there's a new **scan-to-reprint queue**. Per-product "hang tags" panel: checkbox + copy-count per tag (defaults to current stock, editable) instead of a single "print everything, one each" link. New scan-to-reprint panel on `/admin/inventory`: scan a damaged/missing tag's barcode (same autofocus-input pattern as the existing inventory search) to queue it for reprint; scanning the same SKU again bumps its copy count; one print generates the whole queue as one PDF, then clears. Not scoped to one product — a damaged tag can belong to any of the catalog's products. Backend: `generateHangTagsForVariants` now takes `{variantId, quantity}` pairs (clamped to 100 copies/tag); new `getVariantBySku` exact-match lookup; both flows share one POST route, `/api/admin/hang-tags/print` (existing per-product GET route untouched). All of the above verified live end-to-end, including error handling on an invalid scanned SKU.

### Verified working (live-tested, not just compiling)
Prod build clean · Code 128 barcode + **50×30mm landscape** hang-tag PDF (redesigned Jul 7 to match the client's reference template — barcode+SKU on top, two-column MRP/size vs. fabric/care, vertical HSN code on the right edge, black logo mark, rounded border) + GST invoice PDF all generate correctly (currency prints "Rs." — Helvetica has no ₹ glyph) · homepage renders dynamic banners/arrivals/categories · guest checkout open · coupon UI · Razorpay modal flow → `/payment-processing` → `/order-confirmation` · all 3 Razorpay webhook events · Delhivery status webhook · all 4 WhatsApp triggers (opt-in gated, no-op until API key) · OTP code in branded email · PDP SEO (metadata + JSON-LD, now incl. `aggregateRating`) · RLS on all 20 tables · admin RBAC gate.

### Storefront (Vismaya) — ~all pages shipped
Homepage, PLP (/shop + /shop/[category]), PDP (now with star rating + reviews section), cart, checkout, payment-processing/failed, order-confirmation, search, full account section (orders page now has a "rate this" / "edit review" button per delivered item), legal pages (/privacy-policy, /return-policy, /shipping-policy, /terms, /contact, /fabric-care — note: NOT /privacy etc.), auth. **Auth = password + email-OTP + Google OAuth (all three; OTP-only was reverted by client-approved decision).** Google OAuth is enabled in Supabase (client ID rotated Jul 24, see the "Google sign-in was broken" entry above) — **genuinely verified working now**, not just reaching Google. The earlier "verified working" note in this doc was wrong: Google's own handshake reached completion, but no `customers` row was ever created for a first-time OAuth sign-in, so every real customer except one pre-existing test account was silently signed out with no error. Fixed Jul 24 (PR #241) — see above for the full story before trusting any future "OAuth works" claim in this file without a live re-check.

### Admin — no longer read-only
Full CRUD is live across **every** resource: products, **categories** (list/create/edit/delete — built from scratch Jul 7, previously had backend actions but zero UI, so "Dresses"/"Tops" only existed via seed script), inventory, orders, returns, coupons, banners, collections, reviews. Delete buttons added to all list pages Jul 7 (products/banners/collections/coupons/reviews — the actions already existed, just weren't wired to anything). Admin create/edit forms also had a real bug fixed Jul 7: submit buttons didn't visually disable on invalid input, so clicking submit with a missing field silently did nothing — now they properly disable.
One admin exists: Arpitha, `aarnabyarpithabhishek@gmail.com`, Supabase UID `5644c143-c259-4410-91df-51684db6bc9c`, role owner.

**Homepage "made to live in" two-video section (added Jul 19).** Previously this was the general `banners` carousel filtered to video-type entries — since the client never uploaded a video banner, it silently rendered its empty-state placeholder forever (a big blank box above the "Made to live in." heading). Replaced with a purpose-built fixed two-slot layout (side by side desktop, stacked mobile), backed by its own `homepage_video_slots` table (`position` enum `left`/`right`, unique — at most 2 rows ever) rather than shoehorned into `banners`. Managed at `/admin/homepage-videos` (two independent save forms, one per side); public read via `getActiveHomepageVideoSlots()` in `lib/actions/banners.ts`; storefront component is `components/storefront/two-video-section.tsx`. Either side left unconfigured (or deactivated) shows the standard `cloth-window` placeholder instead of blank space. Table has RLS enabled (added to `lib/db/rls.sql`) and was created via a one-off script, not `db:push`.

**Product style codes + auto-SKU (added Jul 14).** Each product gets a `styleCode` on creation — 2-letter category prefix (derived generically from the category name, not hardcoded) + a per-category sequence, e.g. `DR001`, `TP004`. Shown read-only on the product edit page. Adding a size/color tag auto-fills its SKU as `{styleCode}-{COLOR3}-{SIZE4}` (e.g. `DR001-MRN-M`) instead of the admin typing one by hand — still editable to override. Legacy variants/products from before this shipped get their style code backfilled lazily the next time a tag is added. Logic lives in `lib/actions/admin/products.ts` (`categoryPrefixFrom`, `colorCodeFrom`, `sizeCodeFrom`, `nextStyleCode`, `generateUniqueSku`); `createVariant`'s `sku` param is now optional. Schema: `products.styleCode` (nullable, unique) — added via a one-off script, not `db:push` (see gotcha above).

**Admin reports for the accountant (added Jul 22).** New `/studio/reports` page — two downloadable reports, each in CSV/Excel/PDF, over a preset (this month / last month / this quarter / this financial year) or custom date range:
- **General sales report** — every order in the period regardless of status (payment/fulfillment status columns included), filtered by `orders.createdAt`. A business overview, not a tax document.
- **GST sales register** — the exact shape an accountant needs to file GSTR-1/GSTR-3B: one row per order *per GST rate present* (an order can mix 5%/18% lines, see `lib/gst.ts`), with taxable value, CGST/SGST/IGST, HSN, and buyer GSTIN when given. Filtered by `orders.placedAt` (set exactly once, in the `payment.captured` webhook, at the same moment `invoiceNumber` is assigned — see `markOrderPaid` in `lib/db/queries/orders.ts`), so unpaid/failed orders are correctly excluded. Reuses `calculateOrderGst` from `lib/invoice/generate.ts` — the same function that generates the actual customer-facing tax invoice — so the register always reconciles with what was really invoiced. Doesn't generate credit notes for refunds (a refunded order still shows its original invoiced values); flag refunds to the accountant separately if needed.
- All date-range math (month/quarter/FY boundaries) is done in IST via a fixed +05:30 offset (`lib/reports/date-range.ts`) — Vercel functions run in UTC regardless of region, so naive UTC month boundaries would misattribute orders placed late at night IST.
- New dependency: `exceljs` (real `.xlsx` generation — CSV needed no library, PDF reuses the existing `@react-pdf/renderer` + brand-styling pattern from `lib/invoice/template.tsx`, landscape-oriented as `lib/reports/report-pdf.tsx`).
- Download goes through `/api/admin/reports/export` (GET, admin-gated) rather than a server action, since server actions can't stream a binary/text file — same reasoning as the existing invoice-PDF route.
- **Found + fixed a real pre-existing bug while building this**: `isInterStateOrder` (`lib/invoice/generate.ts`) did a plain lowercase string compare against `"karnataka"` — a real order had its shipping state stored as `"Karnātaka"` (a diacritic, likely an address-autofill artifact), which silently failed the match and charged IGST instead of CGST+SGST on that customer's actual tax invoice. Fixed by stripping diacritics (Unicode NFD-normalize + strip combining marks) before comparing — this fixes the existing invoice PDF too, not just the new report, since both share the function.

**Bulk invoice printing (added Jul 22, `#192`).** The orders list (`/studio/orders`) has a checkbox per row now — only orders with an invoice number are selectable, since unpaid orders have nothing to print — plus a header checkbox to select every eligible row on the page. A sticky bar appears once anything's selected: "N invoices selected · print invoices" posts the selection to `/api/admin/orders/invoices/print` and opens one merged PDF in a new tab, same shape as the existing hang-tag bulk print. `lib/invoice/template.tsx`'s single-page markup was extracted into `InvoicePage`, reused by both the existing `InvoiceDocument` (one page) and the new `InvoiceBatchDocument` (one `Document`, one `Page` per invoice) — no change to the existing single-invoice PDF's output. `regenerateInvoicePdfBatch` (`lib/actions/admin/orders.ts`) fetches orders + line items in two queries, not N+1, and silently skips any order without an invoice number rather than failing the whole batch. Selection is scoped to the current page — paging away resets it.

### Reviews — full loop built Jul 7 (was pure plumbing before)
Customers can submit a review from `/account/orders` (delivered items only, one review per product — resubmitting edits it and resets to `pending`). Admin moderates via a live status dropdown on `/admin/reviews` (was a static, non-interactive pill before). Approved reviews now display on the PDP (star rating + count under the title, full review list section below) and feed `aggregateRating` in the Product JSON-LD. **No real reviews exist yet** — this closes the "no way to write/see reviews" gap from the Jul 4 audit, but it's unexercised by real customers until real orders exist.

### Known gaps / decisions pending
- **Broken links — RESOLVED Jul 11** (see audit above). `/about` remains unbuilt but nothing links to it. `/collections` (list + detail) has since been built — see below.
- **Return window inconsistency — RESOLVED Jul 11, 3 days everywhere** (see audit section above).
- **`/collections` — BUILT.** List + detail pages exist (`app/(storefront)/collections`), no longer an open build-vs-descope decision.
- **PDP zoom — BUILT.** Pinch-zoom lightbox + desktop cursor-magnify on the product gallery; a mobile rendering bug was fixed in `fix/pdp-zoom-lightbox-mobile` (merged #154).
- **Quotation debt, still not built:** best-sellers ranking, rate limiting, Cloudflare CDN (DNS is Hostinger→Vercel direct), handover documentation. (Customer reviews UI, product zoom, and `/collections` — previously listed here — are all built, see above.)
- **DB content — RESOLVED Jul 24: real launch catalog is in.** 11 real products live (8 Dresses / 3 Tops — client decision to launch with 11, not the originally-planned 16, see top of file), each verified with 5 variants, real photography (3–5 images), fabric composition, wash care, and MRP. 5 active banners, both homepage video slots configured. The one stray test product (`"hello"`, draft status) plus its one test order (Arpitha's own ₹100 test checkout) were deleted Jul 24 — cleanly, including the order's `message_log` rows and the return raised against it. Collections deliberately left at zero for launch (client decision, not a gap) — `/collections` renders empty, acceptable since it's outside the documented product/category scope.
- **`requestReversePickup` now implemented** (`lib/delhivery/index.ts`, part of `#145`, pending merge) — points at Delhivery's **production** endpoint per current `.env.local`, not exercised live yet; manual returns still OK as a fallback (best-effort, failure doesn't block the status update). WhatsApp read-receipts not persisted; search is client-side over 60 products (fine at launch scale).

### Dev environment gotchas (learned Jul 7 — worth knowing before your next session)
- **Git worktrees don't inherit `.env.local`** (it's gitignored). If you spin up a new worktree, copy it over manually from the main checkout before `npm run dev` — otherwise every request 500s in `middleware.ts` with a Supabase "URL and Key required" error.
- **Supabase's connection pooler intermittently cancels every query** (`aws-1-ap-south-1.pooler.supabase.com:6543`, statement timeout in ~180ms even on `select 1`) while the direct connection (`db.<ref>.supabase.co:5432`) works fine. If the dev server suddenly hangs on every page (8–20s+ per request), this is almost certainly it — check the Supabase dashboard for pooler health, and `DATABASE_URL` can be pointed at the direct-connection string as a local-only workaround (never ship that swap to production — the pooler exists for connection-limit reasons that matter at scale).
- **`DIRECT_URL` does not work from Vercel at all — don't reach for it as a build-time or production fix (learned Jul 22).** It resolves to Supabase's IPv6-only direct-connection address, and Vercel's build machines (`iad1`) have no IPv6 route to it — any code path that tries it there fails immediately with `ENETUNREACH`, which is a harder failure than the pooler flakiness it might seem to fix. It only works from environments with IPv6 egress (a local dev machine), which is why `scripts/apply-*.ts` prefer it — those are meant to be run manually, never as part of `next build` or a deployed function. `lib/db/index.ts` always uses `DATABASE_URL` unconditionally for exactly this reason; if build-time static generation needs to survive pooler flakiness, harden the specific query with **`safeDbRead()` (`lib/db/safe-query.ts`, added Jul 24 in #248 — the canonical helper now, wraps any DB read in a timeout-wins-unconditionally race + graceful fallback)** rather than switching connection strings. Every statically-generated/ISR storefront page that reads the DB at render time already routes through it (the shared layout's `getCategoriesSafe()`, the homepage, `/collections`); a bare `await` on a render-path query can hang the whole `next build`.
- **`@react-pdf/renderer` caches decoded images in memory by file path.** If you edit an image asset used in a PDF (e.g. the hang-tag logo) while the dev server is running, you must restart the server — it'll keep serving the old image from its in-memory cache otherwise, even though the file on disk is correct.
- **The `preview_start`/Browser-pane dev server can silently resolve to the wrong git worktree (learned Jul 19).** When multiple worktrees of this repo exist, the harness's named dev-server launcher may bind port 3000 to a *different* worktree than the one you're actually editing — `curl localhost:3000` will 200 with real-looking content, but it won't reflect your changes, and there's no error. The tell: the Turbopack "detected additional lockfiles" warning names whichever worktree's lockfile it found as secondary — if it's NOT the one you're working in, you're looking at the wrong server. Fix: stop the preview server, run `npm run dev` yourself from the correct worktree directory (`cd` there first) in the background on port 3000, then reload the Browser pane. Verify by `curl`-ing for a string unique to your actual edit before trusting any screenshot.
- **`npm run db:push` is not safe to run blindly (learned Jul 14).** Drizzle's push is fully declarative against `schema.ts` — it doesn't know RLS policies (`lib/db/rls.sql`, applied out-of-band via `npm run db:rls`) or the `order_seq` invoice sequence (also created out-of-band) are supposed to exist, since neither is declared in `schema.ts`. Running push proposed **disabling row-level security on every table and dropping `order_seq`** to "reconcile" that drift — either would have been a real incident (RLS gone = anon REST wide open; dropped sequence = broken invoice numbering). It also prompts interactively (e.g. "truncate this table?") when adding a unique constraint to a non-empty table, which fails outright in a non-TTY session rather than defaulting to safe. **For an additive, low-risk change (new nullable/unique column), write and run a one-off script with the `postgres` client instead** (see the pattern in `scripts/apply-rls.ts`) rather than invoking `db:push`. If you do need `db:push` for a real migration, run it interactively and read every proposed statement before accepting — never pipe input to it or run it unattended.

### External / accounts state
- **Razorpay: LIVE keys approved + stored in `.env.local` as `RAZORPAY_LIVE_KEY_ID/SECRET` (production-only — active vars stay TEST until QA passes).** Active test key rotated Jul 8 (`rzp_test_TAvw2poEhlUndZ` — see Bugs fixed Jul 8 above) and confirmed working end-to-end. **Test webhook secret confirmed present in Vercel production as of Jul 22** (see the resolved "Razorpay doesn't accept payments" section above). Live webhook secret still needs generating once the live keys are actually switched on (see Risks to Watch).
- **WhatsApp/Interakt: all 4 templates submitted to Meta Jul 8** — `order_placed` already **Approved** (fast turnaround, well under the usual 1–7 days), `delivered`/`return_received`/`refund_processed` submitted and pending review. `WHATSAPP_API_KEY` live in `.env.local`. Interakt account upgraded to the **Growth plan (₹2,799/month)** to unlock template creation (a free/trial tier blocks it — the Template/Message send API + Message Status Webhooks are Growth-tier features). Template names match the code's `WhatsappTemplateKey`s exactly (`order_placed`, `delivered`, `return_received`, `refund_processed`) — case-sensitive, since `sendTemplate()` sends `template.name` as these literal strings. Code side (`lib/whatsapp/index.ts`) is fully built, all 4 trigger points wired, currently graceful-no-ops until each template clears review. **Remaining before fully live:**
  1. Wait for `delivered`/`return_received`/`refund_processed` to clear Meta review (check Interakt → Templates → Active).
  2. `WHATSAPP_WEBHOOK_SECRET` (optional but recommended) — if Interakt issues a signing secret for delivery/read-receipt webhooks. The webhook URL to give Interakt is `https://<deployed-domain>/api/webhooks/whatsapp` (route already built) — needs the real deployed URL, so it's a post-deploy step.
  3. `WHATSAPP_API_BASE_URL` — only needed if Interakt's base URL differs from the code's default (`https://api.interakt.ai/v1/public`); otherwise leave unset.
- **shopaarna.in is LIVE with a placeholder mini-site** (coming-soon + shop preview + about/contact + all policy pages w/ GSTIN) — repo `aarna-coming-soon` under Arpitha's GitHub (`aarnabyarpithabhishek-collab`, also repo collaborator), deployed on **her** Vercel (Hobby). Built to pass Razorpay/Meta/Delhivery site checks (it did).
- **Supabase Send-Email hook configured** (secret in env, hook enabled, placeholder URL) — re-point URL to real app at deploy.
- Delhivery fully configured (`Aarna Godown`/560085, prod base, webhook token). `DELHIVERY_CLIENT_NAME`/`DELHIVERY_MODE` env vars are unused leftovers — ignore.

### Hardware (client purchase list)
**Decided (Jul 4): helett H30CPro printer (~₹6–7K, Amazon ASIN B0FKZPDH66)** — prints Delhivery 4×6 labels AND the 50×30mm hang tags (media range 26–116mm verified). Buy 4×6 rolls + **50mm-wide × 30mm** label rolls.

**Barcode scanner — REVISED Jul 24: back in scope, needed for launch (not deferred).** The original Jul 4 "skip it, buy later" call is reversed — client wants it set up now. Buy the previously-recommended **Helett HT20pro** (or any standard USB/Bluetooth scanner that reads Code 128 — the hang tags' barcode standard, see below). **No app code work is needed for this** — verified directly against current code (Jul 24): any HID-keyboard-emulation scanner (the standard, cheap kind — no special driver, it just "types" the scanned text + Enter into whatever has focus) already works end-to-end against two real, built features:
- `/studio/inventory`'s search box — has `autoFocus`, submits on Enter (`AutoSubmitForm`), explicit code comment confirms this is deliberate scanner support.
- The scan-to-reprint queue on the same page (`reprint-scan-panel.tsx`) — scan a damaged/missing tag's barcode to queue it for reprint, scan the same SKU again to bump its copy count, print the whole queue as one PDF. Handles scans arriving faster than lookups complete (queued, processed one at a time, never drops a scan). Note: this input does *not* auto-focus on page load (the search box above it does) — click into it once first, then scanning works hands-free from there.

**Setup, once the hardware arrives**: plug in via USB (or pair via Bluetooth), no software install needed for a standard HID scanner — test by clicking into either input above and scanning a real hang tag. If it doesn't type the SKU + Enter automatically, check the scanner's own manual for its "keyboard wedge" / HID mode (should be the default).

### DEPLOY PLAN — historical, steps 1–4 DONE, superseded by "Immediate Next Steps" above
Original 5-step plan from the pre-deploy era. Steps 1–4 (Vercel deploy, env vars, post-deploy dashboard config, test-key QA) are all long done. Step 5 (flip live, DNS cutover, prod Supabase decision) is the same work now tracked live in **"Immediate Next Steps"** near the end of this file — that section is the current source of truth for what's actually left, not this one. Left here only for the historical env-var/QA detail:
1. Vercel under **Sam's** account (Sam1512-tech) — transfer to client at handover (now deliberately deferred, see Immediate Next Steps). Import repo, paste env vars (full list with test-Razorpay convention is in the Jul 4 session; `.env.example` documents it).
2. Set `NEXT_PUBLIC_APP_URL` to the assigned `*.vercel.app` URL first (QA), redeploy.
3. Post-deploy config: Razorpay TEST webhook → deployed URL (get `RAZORPAY_WEBHOOK_SECRET`); Supabase Auth hook URL + Site URL/redirect allowlist; Google OAuth authorized origins += vercel.app URL; Delhivery status webhook URL.
4. Full QA with test keys (card 4111…, UPI success@razorpay), incl. real shipment creation via new `createDelhiveryShipment` admin action.
5. Only after QA: flip Razorpay env to live keys, create LIVE webhook, load real products/banners, re-point shopaarna.in DNS from placeholder to real app, set `NEXT_PUBLIC_APP_URL=https://shopaarna.in`, create prod Supabase (+ `npm run db:rls`) or accept dev DB at launch (decide).

---

## The Team

- **Sam (you)** — project lead, handles all backend, can do frontend too
- **Vismaya** — frontend only, zero backend knowledge, uses AI to build UI
- **Dhanush** (GitHub `Venomics14`) — a friend of Sam's helping out informally on backend work, added Jul 23. Real repo collaborator (write access), not part of the original 2-person team — don't flag PRs from this account as unrecognized. Opened `#236` (a real backend/auth fix), independently reviewed and merged.
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

- [x] **Razorpay webhook secret** — confirmed present in Vercel production as of Jul 22, see the resolved section above (originally: Razorpay dashboard had a platform outage blocking this)
- [x] Delhivery — Delhivery One account live; API token + pickup (`Aarna Godown`, 560085) + generated `DELHIVERY_WEBHOOK_TOKEN` in `.env.local` (production base `track.delhivery.com`). **Live serviceability verified** (prepaid serviceable: Bengaluru/Delhi/Mumbai/Kolkata/Sikkim); checkout pincode check now hits the real API. **Remaining:** live shipment creation + AWB + status webhook — exercised at deploy/first real shipment (webhook needs the deployed URL). Pickup name must match the Delhivery One panel exactly.
- [x] WhatsApp BSP (Interakt) — **code complete, all 4 templates Approved by Meta as of Jul 24** (`order_placed`, `delivered`, `return_received`, `refund_processed` — confirmed by Sam directly in Interakt → Templates). `sendTemplate()` (Interakt) + all 4 trigger points wired, opt-in gated via `orders.whatsapp_opt_in`, every send logged to `message_log`. Fully live, nothing pending. Template drafts: `docs/whatsapp-templates.md`.
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
- `app/studio/` — admin dashboard UI (route renamed from `/admin` Jul 22, see status below)
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
- **GST registered** — issue proper "Tax Invoice" not "Bill of Supply". Business legal name: **Aarna Label**. GSTIN: `29ACNFA3302J1ZD` (Karnataka). Registered address: No. 3571, 1st H Cross, Behind Girinagar Police Station, Giri Nagar, Bengaluru – 560085, Karnataka. Business phone: +91 79-75639485. Include GSTIN on all order invoices. HSN code for garments: 6211. **Invoice number format:** `AL/26-27/00001` (financial year, resets every April).
- **GST rate is value-slab based, per garment (added Jul 19), not a flat rate.** Per current GST Council schedule for HSN 6211: a piece priced at or under ₹2500 is 5%, above that is 18% — evaluated on each order item's own unit price, not the order total, so one order can legitimately mix 5% and 18% lines. Intra-state (Karnataka) splits the rate into CGST+SGST (half each); inter-state is IGST at the full rate. Constants + the threshold live in `lib/gst.ts`; the actual per-line calculation (incl. proportional discount allocation across lines, so a coupon can't shift which slab a piece falls into) is `calculateOrderGst` in `lib/invoice/generate.ts`. The invoice PDF itemizes each rate present as its own taxable/tax row — never blends 5% and 18% into one number.
- **Buyer GSTIN (added Jul 19)** — optional field at checkout (`orders.gstNumber`, nullable) for business customers who want their GST number on the invoice. Format-validated both client-side and server-side (`initCheckout`) against the standard 15-char GSTIN pattern in `lib/gst.ts`. Shown under "Bill To" on the invoice PDF and in the admin order detail's Payment card when present.
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
- **In practice, a plain `gh pr merge` gets blocked by that requirement even for the sole maintainer** — `enforce_admins: false` only unlocks the `--admin` override flag, it doesn't silently bypass the review count on a normal merge. **Standard merge command going forward: `gh pr merge <N> --admin --squash`.** Confirmed as Sam's standing preference, not a one-off — don't ask before using it on a routine solo merge.
- Sam's branches: `be/<feature>` (e.g. `be/cart-actions`), or a descriptive `fix/<name>`/`feat/<name>` for launch-sprint work
- Vismaya's branches: `fe/<feature>` (e.g. `fe/homepage`)
- SSH is configured — `git push` works without tokens
- All merges go through GitHub PRs
- `delete_branch_on_merge` is enabled — branches auto-delete on merge, no manual cleanup needed

---

## Payment Milestones

- ₹40,000 advance — already received
- ₹52,000 — design approved; payment received (~27 Jun 2026)
- ₹39,000 — on go-live (Week 12)

---

## Immediate Next Steps (as of Jul 24 — see 🚨 CURRENT STATUS for full detail)

Deployment, admin CRUD, content entry, and Interakt are all long done — this list is now specifically the two-phase launch's remaining items, all external-dashboard work only Sam can do:

1. **Activate the coming-soon gate**: set `ORDERING_OPENS_AT=2026-07-29T11:00:00+05:30` + `PREVIEW_ACCESS_SECRET=<random>` in Vercel production, redeploy. Code (PRs #237/238) is merged but inert without this.
2. **Flip Razorpay to live keys + create the live webhook** — live keys already sit in `.env.local`, production deliberately still on test keys pending this. Real money — do deliberately, with buffer to re-test before the 29th.
3. **DNS cutover**: shopaarna.in still points at Arpitha's placeholder mini-site. Re-point DNS → `NEXT_PUBLIC_APP_URL=https://shopaarna.in` + redeploy → re-point every webhook URL (Razorpay, Supabase auth, Google OAuth origins, Delhivery, Interakt) at the final domain, all in one sitting.
4. **Decide: new prod Supabase project, or ship on the current dev DB?** No prod project exists yet. A new one needs `npm run db:rls` re-run (only applied to dev currently).
5. **Vercel project transfer to the client's account — deliberately deferred** (Sam's call, Jul 24): still needs dashboard access for items 1–3 above, transferring now risked losing that mid-sprint. Revisit once those are done and stable.
6. Handover documentation + Loom walkthrough videos, and an admin training session for Arpitha — still not started.

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
    - **Reviews:** `getAdminReviews()`, `updateReviewStatus(id, status)`, `deleteReview(id)` (admin) + `getReviewableItems()`, `submitReview()`, `getApprovedReviews(productId)` (customer-facing, `lib/actions/reviews.ts`, added Jul 7)

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
4. Client prints on the helett H30CPro using a **50mm-wide × 30mm** label roll (landscape layout; barcode runs horizontally across the 50mm width)

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

## Risks to Watch (two-phase launch: public Mon Jul 27, ordering Wed Jul 29 11 AM IST)

- ~~Product photography~~ **RECEIVED Jul 8, uploaded + entered.** ~~Meta template approval~~ **All 4 Approved as of Jul 24.** ~~Interakt API-key access~~ **Cleared Jul 8.** ~~Deploy to Vercel~~ **Done Jul 8.** ~~Product catalog~~ **11 products finalized Jul 24 (client decision).**
- **Coming-soon gate is merged but inert until Sam sets the two env vars in Vercel and redeploys** (see Immediate Next Steps #1) — without this, "public Monday, ordering Wednesday" has no actual mechanism behind it.
- Razorpay live webhook secret + live keys still need flipping on before the 29th — this is now the single highest-stakes remaining step. Never run casual checkout tests once live keys are active — real money moves.
- **Don't trust a prior "verified working" claim in this file about Google OAuth without re-checking live** — it was wrong for weeks (see the Jul 24 entry above): the handshake reaching Google was mistaken for the whole flow working, when a `customers` row was silently never being created for real customers. Now actually fixed and verified, but this is the second time an auth integration "looked done" and wasn't — treat auth-flow claims in this doc as needing a fresh live check, not just a code read, before relying on them.
- **No bot filtering, IP allowlisting, or CAPTCHA in front of `/studio` (admin panel) or the storefront's login/signup.** Application-level rate limiting exists (login/OTP/signup/coupon-apply) and closes the "unlimited attempts" part of this, but there's still no edge/WAF layer — no Cloudflare yet — and no CAPTCHA. Both blocked on creating a Cloudflare/Turnstile account, not a code change. Revisit once DNS moves (Cloudflare Access is the planned fix, would also handle the DNS cutover need above).
- Vercel project transfer to the client is deliberately on hold (Sam's call, Jul 24) until the live-Razorpay/DNS work is done — don't transfer early without confirming Sam gets re-added as a collaborator, or he loses dashboard access mid-sprint.
