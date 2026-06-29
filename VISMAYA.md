# Vismaya — Frontend Build Tracker

Your one-stop check-in document. Read this every time you start work. Tick boxes as you ship.

> **Read order:** this file first → then `HANDOFF.md` for setup/git/conventions if anything's unclear. `CLAUDE.md` is Sam's; don't worry about it.

---

## ⚠️ The One Rule You Cannot Break

**Categories must always come from `getCategories()` — never typed as strings.**

Wherever you show "Dresses", "Tops", or any category name, fetch them from the DB. No hardcoded category names anywhere — not even as fallbacks. If the array is empty, render nothing or a generic placeholder. This is the only architectural constraint. Design, palette, typography, brand voice, layout — all your call.

---

## ✅ Done So Far

- [x] Homepage (`app/(storefront)/page.tsx`)
- [x] `site-header`, `site-footer`, `scroll-rail` components
- [x] `/login`
- [x] `/signup`
- [x] Admin landing page placeholder

---

## 🔨 To Build — in this order

Work top to bottom. Later pages depend on earlier components. If you need to skip ahead, ping Sam first.

### Phase 1 — Reusable foundation
- [ ] **`ProductCard` component** — build once, reused on homepage, PLP, related products, wishlist. Image, title, price (use `formatINR`), hover state.

### Phase 2 — Storefront purchase flow (highest priority)
- [ ] **`/product/[slug]`** — PDP
  - Calls: `getProductBySlug(slug)`, `getRelatedProducts(productId, 4)`, `addToCart(variantId, qty)`, `addToWishlist(variantId)`
  - Size/color picker → enables Add to Bag
  - Wishlist heart enables ONLY after a variant is picked (wishlist is variant-level)
  - Add SEO: `productMetadata(product)` in `generateMetadata()`, drop `buildProductLd(product)` into `<script type="application/ld+json">`
- [ ] **`/shop/[category]`** — Category PLP
  - Calls: `getProducts({ category: slug, page, sort, minPrice, maxPrice })`, `getCategories()` for filter sidebar
  - Pagination + sort (newest, price asc, price desc)
  - SEO: `categoryMetadata(category)`
- [ ] **`/shop`** — All products PLP shell
  - Same as above without category filter
- [ ] **`/cart`** — Cart page
  - Calls: `getCart()`, `updateCartItem(variantId, qty)`, `removeFromCart(variantId)`, `applyCoupon(code)`
  - Coupon returns `{ ok, message, cart, discount }` — discount is in paise
  - Show: subtotal − discount + shipping = total
  - Free shipping above ₹2999
- [ ] **`/checkout`** — Checkout
  - **Must collect `email` field separately** (not from shipping address — `initCheckout` requires it)
  - Pincode field → call `checkPincodeServiceability(pincode)` before submit
  - "WhatsApp opt-in" checkbox
  - Submit → `initCheckout({ email, shippingAddress, billingSameAsShipping: true, whatsappOptIn, couponCode? })` returns `{ summary, razorpay }`
  - Open Razorpay modal with the `razorpay` handle (see snippet in `HANDOFF.md` Section 6)
  - On payment success → redirect to a thank-you page. Server webhook handles invoice + email.

### Phase 3 — Auth completion
- [ ] **`/forgot-password`** — email input → `requestPasswordReset(email)`
- [ ] **`/reset-password`** — new password form → `updatePassword(newPassword)`
- [ ] **`/auth/callback`** — catches Supabase verification redirect, exchanges code for session, redirects to `/account`

### Phase 4 — Customer account
- [ ] **`/account`** — Dashboard landing — `getCurrentCustomer()`, quick-link tiles, "Sign Out" → `logout()`
- [ ] **`/account/orders`** — `getMyOrders()`, optional detail via `getMyOrderDetail(orderNumber)`
- [ ] **`/account/addresses`** — `getMyAddresses`, `createAddress`, `updateAddress`, `deleteAddress`, `setDefaultAddress`
- [ ] **`/account/wishlist`** — `getWishlist()`, `removeFromWishlist`, "Move to cart" → `addToCart` + remove
- [ ] **`/account/returns`** — `getMyReturns()`, raise new via `requestReturn({ orderItemId, reason, reasonCategory? })`
  - Server-enforced: must be delivered, within 14 days, no duplicate

### Phase 5 — Legal pages (static text, client provides copy)
- [ ] `/privacy`
- [ ] `/terms`
- [ ] `/returns`
- [ ] `/shipping`

### Phase 6 — Admin (use `shadcn/ui` here for speed — already installed)

Top of every admin page:
```tsx
import { redirect } from "next/navigation"
import { getCurrentAdmin } from "@/lib/actions/auth"
const admin = await getCurrentAdmin()
if (!admin) redirect("/login")
```

- [ ] **`/admin`** — Dashboard
  - `getOrderStats(30)`, `getLowStockVariants(5)`, `getReviewModerationCounts()`
- [ ] **`/admin/products`** — most important
  - `getAdminProducts({ status, categoryId, search, page })`
  - New/edit form REQUIRED fields: title, slug, basePrice, **MRP** (separate from selling price), **fabric composition**, **care instructions** — Legal Metrology Act compliance
  - Variant subtable: `createVariant`, `updateVariant`, `deleteVariant`
  - Image upload via Cloudinary signed upload helper — ask Sam for the front-end widget
  - **"Print Tags" button** → `generateHangTagsForProduct(productId)` returns a PDF buffer; stream as download
- [ ] **`/admin/orders`**
  - `getAdminOrders({ fulfillmentStatus, paymentStatus, search, from, to })`
  - Detail: `getAdminOrderDetail(orderNumber)`
  - Status transitions: `updateOrderFulfillmentStatus(id, status)` (server enforces valid forward-only transitions)
  - `attachAwbNumber(id, awb)` — auto-advances processing → shipped
  - `regenerateInvoicePdf(id)` — re-download invoice
- [ ] **`/admin/inventory`**
  - `getInventory({ search, onlyLowStock, onlyOutOfStock })` — sorted by lowest stock first
  - Adjust: `adjustStock({ variantId, delta, reason, note })`
  - Audit log: `getInventoryMovements({ variantId, reason })`
- [ ] **`/admin/coupons`** — `getAdminCoupons`, `createCoupon`, `updateCoupon`, `toggleCouponActive`, `deleteCoupon`
- [ ] **`/admin/banners`** (homepage hero) — `getAdminBanners`, `createBanner`, `updateBanner`, `toggleBannerActive`, `deleteBanner`, `reorderBanners`
- [ ] **`/admin/collections`** — `getAdminCollections`, `getAdminCollectionDetail`, `addProductsToCollection`, `removeProductsFromCollection`, `reorderProductsInCollection`
- [ ] **`/admin/reviews`** — `getAdminReviews`, `updateReviewStatus`, `bulkUpdateReviewStatus`
- [ ] **`/admin/returns`** — admin-side returns queue (actions in `lib/actions/admin/returns`)

---

## 📚 Backend Contract Cheatsheet

All prices are in **paise** (integer). ₹2,499 = `249900`.

| You want… | Import from |
|---|---|
| Categories, products, collections, new arrivals, related | `@/lib/actions/products` |
| Cart ops | `@/lib/actions/cart` |
| Checkout + pincode | `@/lib/actions/checkout` |
| Auth (signup, login, logout, reset, current user) | `@/lib/actions/auth` |
| Customer account (orders, wishlist, addresses, returns) | `@/lib/actions/account` |
| Active homepage banners | `@/lib/actions/banners` |
| Admin actions | `@/lib/actions/admin/<resource>` |
| SEO metadata + JSON-LD | `@/lib/seo/metadata`, `@/lib/seo/schemas` |
| `cn`, `formatINR` | `@/lib/utils` |

Mock data lives in `@/lib/mocks/products` — shaped exactly like real data. Use it whenever the DB is empty.

---

## 🚨 Sanity Checklist Before Every PR

Tick all before opening the PR. Sam will check these in review.

- [ ] No hardcoded category names (use `getCategories()`)
- [ ] All prices rendered via `formatINR()` from `@/lib/utils`
- [ ] No inline hex codes — only your design tokens from `globals.css`
- [ ] Routes match exactly: `/product/[slug]` (singular), `/shop/[category]`
- [ ] No edits inside `lib/` (except `lib/mocks/`)
- [ ] Pulled `main` before opening the PR (`git checkout main && git pull && git merge main` into your branch)
- [ ] Page loads without console errors in dev
- [ ] Mobile view checked at 375px width

---

## 🔒 Files You Cannot Touch

CODEOWNERS blocks any PR that touches these — don't even let your AI assistant suggest edits here:

`lib/db/`, `lib/actions/`, `lib/supabase/`, `lib/razorpay/`, `lib/delhivery/`, `lib/whatsapp/`, `lib/resend/`, `lib/cloudinary/`, `lib/invoice/`, `lib/labels/`, `lib/seo/`, `app/api/`, `middleware.ts`, `drizzle.config.ts`, `next.config.ts`, `lib/db/schema.ts`, `.env.local`, `.github/`.

**If your AI suggests editing any of these, say no — they're Sam's territory.**

---

## 🔄 Daily Workflow

**Every morning before opening your editor:**
```
cd ~/Documents/Aarna   (Windows: cd C:\Users\acer\OneDrive\Documents\GitHub\Aarna)
git checkout main
git pull
```

**Every new task:**
```
git checkout main
git pull
git checkout -b fe/the-task-name
# build, commit often, then:
git push -u origin fe/the-task-name
```

Open the PR on GitHub. Wait for Sam to approve and merge. Never push to `main`.

**If you've been working on a long-lived branch and main has moved on:**
```
git checkout fe/your-branch
git fetch origin
git merge origin/main
# resolve conflicts in VS Code if any, then commit
```

---

## 💬 When You Are Stuck

1. Re-read this file
2. Check `lib/mocks/products.ts` for the exact data shape you'll receive
3. Search the repo (your AI can do this) — something similar may already exist
4. Open `HANDOFF.md` Section 6 for backend contract examples
5. WhatsApp Sam — always better to ask than to guess

---

## 📋 What's Already Live on the Backend

So you know what's connected and works end-to-end:

- ✅ All 21 server actions wired and tested against the live Supabase DB
- ✅ Razorpay test mode — webhook handles payment.captured, payment.failed, refund.processed
- ✅ Tax Invoice PDF auto-generated and emailed on payment
- ✅ Hang Tag PDF + Code 128 barcode (admin "Print Tags" button calls `generateHangTagsForProduct`)
- ✅ Resend email — 4 branded templates (order receipt, verify, password reset, refund)
- ✅ Cloudinary signed uploads
- ✅ Delhivery serviceability check (real API)
- ✅ Supabase Auth + RLS policies + branded auth emails via Resend hook
- ✅ Dynamic sitemap.xml, robots.txt, JSON-LD schemas
- ✅ Middleware redirects /admin and /account unauthenticated users to /login

Nothing on this list is blocked. You can build every page.

---

*Last updated: keep this file fresh — when you ship a page, tick the box and push the same commit.*
