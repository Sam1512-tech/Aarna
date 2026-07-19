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

## 🚨 CURRENT STATUS — July 18, 2026 (launch sprint to July 20)

**THE APP IS DEPLOYED: https://aarna-gamma.vercel.app** (Vercel, Sam's account `sam1512-tech`, project `aarna`, Hobby plan). Auto-deploys on every merge to `main`. **Full-scope audit completed Jul 4** (27 checks); **admin CRUD + reviews closed out Jul 7**; **coupon bug, Razorpay key rotation, tag printing shipped Jul 8**; **deployed + 12-PR Vismaya batch merged + all 4 WhatsApp templates approved Jul 8–10**; **second full code audit Jul 11** (see below); **Vismaya's 5-branch polish batch + cart-badge follow-ups merged Jul 15**; **cart bug-fix batch + PDP fixes Jul 16**; **returns v2 rework opened for review Jul 18** (see below). State of the world:

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

### "Razorpay doesn't accept payments in test mode" — diagnosed Jul 15 night, fix pending
- **Root cause: `RAZORPAY_WEBHOOK_SECRET` is missing from Vercel production entirely** (confirmed via `vercel env ls production` — not in the list at all, unlike `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`NEXT_PUBLIC_RAZORPAY_KEY_ID` which are all present and correct). `verifyWebhookSignature()` (`lib/razorpay/index.ts`) throws unguarded when the secret is unset, and `app/api/webhooks/razorpay/route.ts` calls it with no try/catch — so **every webhook delivery from Razorpay has been crashing before reaching any handling logic**, `payment.captured` included. This has likely been broken since initial deploy — "Razorpay test webhook → deployed URL" was flagged as an unfinished post-deploy step back on Jul 8 and doesn't appear to have been closed out since.
- **Why this looks like "payment rejected":** the Razorpay modal's success `handler` fires client-side, independent of our webhook — so a test card can be fully accepted by Razorpay and the customer still gets redirected through `/payment-processing` → `/order-confirmation`. But the order never flips from `pending` to `paid` (webhook never got through), so the confirmation page shows "we're confirming your order" indefinitely. Presents identically to a real decline from the storefront side.
- **Verified independently that the rest of the checkout flow is correct:** a live test through the deployed app produced a real Razorpay order (`order_TDomFrkCy1TJW8`, ₹2,598) with the correct test key (`rzp_test_TAvw2poEhlUndZ`) embedded in the client payload, the SDK loaded, and a genuine Razorpay checkout iframe mounted pointed at `api.razorpay.com` with a valid session. Couldn't visually confirm the modal's card-entry UI — Razorpay's own bot/risk-detection script (`razorpay-risk-detection/bundle.js`, loaded alongside checkout.js) blanks the modal for automated browsers, which is expected/correct anti-fraud behavior, not a bug.
- **Fix — two steps, both credential entry, need Sam:**
  1. Razorpay dashboard (test mode) → Settings → Webhooks → confirm/create a webhook pointed at `https://aarna-gamma.vercel.app/api/webhooks/razorpay` with events `payment.captured`, `payment.failed`, `refund.processed` — check whether this was ever actually registered, since the code side implies it wasn't.
  2. Copy the resulting secret into Vercel production as `RAZORPAY_WEBHOOK_SECRET`, then redeploy.
- **Also shipped (#128):** `payment.failed` events previously discarded Razorpay's `error_code`/`error_description` entirely — a genuine card decline and this exact webhook-config gap looked identical in logs ("payment failed", no detail). Now logs Razorpay's own reason, so a real decline is diagnosable once the webhook is actually reachable.
- **Left behind:** one test order (`AARNA-001009`, stuck `pending`) and one Supabase auth test user from live-testing this — both cleaned up except the order, which is harmless to ignore or delete via admin.

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
Homepage, PLP (/shop + /shop/[category]), PDP (now with star rating + reviews section), cart, checkout, payment-processing/failed, order-confirmation, search, full account section (orders page now has a "rate this" / "edit review" button per delivered item), legal pages (/privacy-policy, /return-policy, /shipping-policy, /terms, /contact, /fabric-care — note: NOT /privacy etc.), auth. **Auth = password + email-OTP + Google OAuth (all three; OTP-only was reverted by client-approved decision).** Google OAuth is enabled in Supabase (client ID 1095605963037-…) and verified working.

### Admin — no longer read-only
Full CRUD is live across **every** resource: products, **categories** (list/create/edit/delete — built from scratch Jul 7, previously had backend actions but zero UI, so "Dresses"/"Tops" only existed via seed script), inventory, orders, returns, coupons, banners, collections, reviews. Delete buttons added to all list pages Jul 7 (products/banners/collections/coupons/reviews — the actions already existed, just weren't wired to anything). Admin create/edit forms also had a real bug fixed Jul 7: submit buttons didn't visually disable on invalid input, so clicking submit with a missing field silently did nothing — now they properly disable.
One admin exists: Arpitha, `aarnabyarpithabhishek@gmail.com`, Supabase UID `5644c143-c259-4410-91df-51684db6bc9c`, role owner.

**Product style codes + auto-SKU (added Jul 14).** Each product gets a `styleCode` on creation — 2-letter category prefix (derived generically from the category name, not hardcoded) + a per-category sequence, e.g. `DR001`, `TP004`. Shown read-only on the product edit page. Adding a size/color tag auto-fills its SKU as `{styleCode}-{COLOR3}-{SIZE4}` (e.g. `DR001-MRN-M`) instead of the admin typing one by hand — still editable to override. Legacy variants/products from before this shipped get their style code backfilled lazily the next time a tag is added. Logic lives in `lib/actions/admin/products.ts` (`categoryPrefixFrom`, `colorCodeFrom`, `sizeCodeFrom`, `nextStyleCode`, `generateUniqueSku`); `createVariant`'s `sku` param is now optional. Schema: `products.styleCode` (nullable, unique) — added via a one-off script, not `db:push` (see gotcha above).

### Reviews — full loop built Jul 7 (was pure plumbing before)
Customers can submit a review from `/account/orders` (delivered items only, one review per product — resubmitting edits it and resets to `pending`). Admin moderates via a live status dropdown on `/admin/reviews` (was a static, non-interactive pill before). Approved reviews now display on the PDP (star rating + count under the title, full review list section below) and feed `aggregateRating` in the Product JSON-LD. **No real reviews exist yet** — this closes the "no way to write/see reviews" gap from the Jul 4 audit, but it's unexercised by real customers until real orders exist.

### Known gaps / decisions pending
- **Broken links — RESOLVED Jul 11** (see audit above). `/about` remains unbuilt but nothing links to it. `/collections` (list + detail) has since been built — see below.
- **Return window inconsistency — RESOLVED Jul 11, 3 days everywhere** (see audit section above).
- **`/collections` — BUILT.** List + detail pages exist (`app/(storefront)/collections`), no longer an open build-vs-descope decision.
- **PDP zoom — BUILT.** Pinch-zoom lightbox + desktop cursor-magnify on the product gallery; a mobile rendering bug was fixed in `fix/pdp-zoom-lightbox-mobile` (merged #154).
- **Quotation debt, still not built:** best-sellers ranking, rate limiting, Cloudflare CDN (DNS is Hostinger→Vercel direct), handover documentation. (Customer reviews UI, product zoom, and `/collections` — previously listed here — are all built, see above.)
- **DB content:** no longer literally zero — a handful of test products/variants/a test collection/coupon exist from dev testing, but **no real launch content** (16 real products with real photography, real banners, real collections). **Product photography RECEIVED Jul 8** — no longer blocked; next step is uploading to Cloudinary + entering all 16 products via the (now fully-built) admin product form.
- **`requestReversePickup` now implemented** (`lib/delhivery/index.ts`, part of `#145`, pending merge) — points at Delhivery's **production** endpoint per current `.env.local`, not exercised live yet; manual returns still OK as a fallback (best-effort, failure doesn't block the status update). WhatsApp read-receipts not persisted; search is client-side over 60 products (fine at launch scale).

### Dev environment gotchas (learned Jul 7 — worth knowing before your next session)
- **Git worktrees don't inherit `.env.local`** (it's gitignored). If you spin up a new worktree, copy it over manually from the main checkout before `npm run dev` — otherwise every request 500s in `middleware.ts` with a Supabase "URL and Key required" error.
- **Supabase's connection pooler intermittently cancels every query** (`aws-1-ap-south-1.pooler.supabase.com:6543`, statement timeout in ~180ms even on `select 1`) while the direct connection (`db.<ref>.supabase.co:5432`) works fine. If the dev server suddenly hangs on every page (8–20s+ per request), this is almost certainly it — check the Supabase dashboard for pooler health, and `DATABASE_URL` can be pointed at the direct-connection string as a local-only workaround (never ship that swap to production — the pooler exists for connection-limit reasons that matter at scale).
- **`@react-pdf/renderer` caches decoded images in memory by file path.** If you edit an image asset used in a PDF (e.g. the hang-tag logo) while the dev server is running, you must restart the server — it'll keep serving the old image from its in-memory cache otherwise, even though the file on disk is correct.
- **`npm run db:push` is not safe to run blindly (learned Jul 14).** Drizzle's push is fully declarative against `schema.ts` — it doesn't know RLS policies (`lib/db/rls.sql`, applied out-of-band via `npm run db:rls`) or the `order_seq` invoice sequence (also created out-of-band) are supposed to exist, since neither is declared in `schema.ts`. Running push proposed **disabling row-level security on every table and dropping `order_seq`** to "reconcile" that drift — either would have been a real incident (RLS gone = anon REST wide open; dropped sequence = broken invoice numbering). It also prompts interactively (e.g. "truncate this table?") when adding a unique constraint to a non-empty table, which fails outright in a non-TTY session rather than defaulting to safe. **For an additive, low-risk change (new nullable/unique column), write and run a one-off script with the `postgres` client instead** (see the pattern in `scripts/apply-rls.ts`) rather than invoking `db:push`. If you do need `db:push` for a real migration, run it interactively and read every proposed statement before accepting — never pipe input to it or run it unattended.

### External / accounts state
- **Razorpay: LIVE keys approved + stored in `.env.local` as `RAZORPAY_LIVE_KEY_ID/SECRET` (production-only — active vars stay TEST until QA passes).** Active test key rotated Jul 8 (`rzp_test_TAvw2poEhlUndZ` — see Bugs fixed Jul 8 above) and confirmed working end-to-end. Live webhook secret still needs generating once prod URL exists. Test webhook secret also still pending (old dashboard outage).
- **WhatsApp/Interakt: all 4 templates submitted to Meta Jul 8** — `order_placed` already **Approved** (fast turnaround, well under the usual 1–7 days), `delivered`/`return_received`/`refund_processed` submitted and pending review. `WHATSAPP_API_KEY` live in `.env.local`. Interakt account upgraded to the **Growth plan (₹2,799/month)** to unlock template creation (a free/trial tier blocks it — the Template/Message send API + Message Status Webhooks are Growth-tier features). Template names match the code's `WhatsappTemplateKey`s exactly (`order_placed`, `delivered`, `return_received`, `refund_processed`) — case-sensitive, since `sendTemplate()` sends `template.name` as these literal strings. Code side (`lib/whatsapp/index.ts`) is fully built, all 4 trigger points wired, currently graceful-no-ops until each template clears review. **Remaining before fully live:**
  1. Wait for `delivered`/`return_received`/`refund_processed` to clear Meta review (check Interakt → Templates → Active).
  2. `WHATSAPP_WEBHOOK_SECRET` (optional but recommended) — if Interakt issues a signing secret for delivery/read-receipt webhooks. The webhook URL to give Interakt is `https://<deployed-domain>/api/webhooks/whatsapp` (route already built) — needs the real deployed URL, so it's a post-deploy step.
  3. `WHATSAPP_API_BASE_URL` — only needed if Interakt's base URL differs from the code's default (`https://api.interakt.ai/v1/public`); otherwise leave unset.
- **shopaarna.in is LIVE with a placeholder mini-site** (coming-soon + shop preview + about/contact + all policy pages w/ GSTIN) — repo `aarna-coming-soon` under Arpitha's GitHub (`aarnabyarpithabhishek-collab`, also repo collaborator), deployed on **her** Vercel (Hobby). Built to pass Razorpay/Meta/Delhivery site checks (it did).
- **Supabase Send-Email hook configured** (secret in env, hook enabled, placeholder URL) — re-point URL to real app at deploy.
- Delhivery fully configured (`Aarna Godown`/560085, prod base, webhook token). `DELHIVERY_CLIENT_NAME`/`DELHIVERY_MODE` env vars are unused leftovers — ignore.

### Hardware (client purchase list)
**Decided (Jul 4): helett H30CPro printer (~₹6–7K, Amazon ASIN B0FKZPDH66)** — prints Delhivery 4×6 labels AND the 50×30mm hang tags (media range 26–116mm verified). Buy 4×6 rolls + **50mm-wide × 30mm** label rolls. **Barcode scanner deliberately skipped at launch** (16 products / low volume — not worth ₹2.7K); buy a Helett HT20pro later when volume justifies. `/admin/inventory` search accepts scanned or typed SKUs either way.

### DEPLOY PLAN — steps 1–2 DONE Jul 8 (deployed at aarna-gamma.vercel.app — see status above); steps 3–5 remain
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
- [ ] WhatsApp BSP (Interakt) — **code complete**, `WHATSAPP_API_KEY` live in `.env.local` as of Jul 8. `sendTemplate()` (Interakt) + all 4 trigger points wired (order_placed, delivered, return_received, refund_processed), opt-in gated via `orders.whatsapp_opt_in`, every send logged to `message_log`. **All 4 templates submitted to Meta Jul 8** — `order_placed` already Approved, the other 3 pending review. Template drafts: `docs/whatsapp-templates.md`.
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

1. **Deploy to Vercel** (step-by-step plan in the status section) — admin CRUD is done, this is now the top blocker.
2. Post-deploy config: Razorpay test webhook, Supabase auth hook URL + redirect allowlist, Google OAuth origins, Delhivery webhook, Interakt webhook URL (`/api/webhooks/whatsapp`).
3. **Upload received product photography to Cloudinary + enter all 16 products** via the admin product form (photography is no longer the blocker — data entry is).
4. Wire up Interakt now that credentials are live: add `WHATSAPP_API_KEY` to `.env.local`, confirm the 4 Meta-approved template names match the code exactly (see External/accounts state above).
5. Full QA on test keys → flip to live Razorpay keys + live webhook → load real content → DNS cutover from placeholder to real app.
6. ~~Decide with client: product zoom / `/collections` page~~ — both are built now, no decision needed (see Known gaps above).
7. Pre-go-live: prod Supabase (or accept dev DB), `npm run db:rls` on prod, handover docs + Loom videos, transfer Vercel to client.

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

## Risks to Watch (July 20 deadline)

- ~~Product photography — STATUS UNKNOWN as of Jul 4~~ **RECEIVED Jul 8.** Remaining work is upload + data entry, not waiting on the client.
- ~~Meta template approval not yet submitted~~ **All 4 submitted Jul 8** — `order_placed` Approved already; `delivered`/`return_received`/`refund_processed` pending review (check Interakt → Templates → Active for status). Interakt required upgrading to the Growth plan (₹2,799/mo) to unlock template creation — free/trial tier blocks it.
- ~~Interakt API-key access blocked~~ **Cleared Jul 8** — credentials live, key is in `.env.local`, subscription active, templates submitted.
- Razorpay live webhook secret can only exist after deploy — deploy early, don't stack this to the last week
- Deploy to Vercel is now the top blocker — admin CRUD, photography, and Interakt are all unblocked, nothing else is waiting on the client
- Never run casual checkout tests once live Razorpay keys are active — real money moves
