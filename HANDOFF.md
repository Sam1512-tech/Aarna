# Handoff — Frontend Dev (Vismaya)

Read this fully before writing a single line of code. Use it as your daily reference.

---

## 1. What We Are Building

**Aarna by Arpitha Abhishek** — a women's indo-western fashion e-commerce store for the Indian market.

- India-only, English, prices in ₹ (INR)
- Online payments only (UPI, cards, net banking via Razorpay — no cash on delivery)
- Customers: women shopping for dresses, co-ord sets, kurta sets, jackets, tops & tunics
- 10–12 week delivery timeline — we are already in Week 1

**Design direction, brand voice, palette, typography, layout — all your call.** Build what feels right. Sam reviews PRs for correctness (broken routes, calling server actions properly), not for aesthetic choices.

---

## 2. The Two of Us — Who Does What

| | Sam | Vismaya |
|---|---|---|
| **Owns** | Database, server actions, all 3rd-party APIs (Razorpay, Shiprocket, WhatsApp, Resend, Cloudinary), auth, webhooks, deployments | All storefront UI, all admin UI, components, Tailwind styling |
| **Reviews** | Every PR Vismaya opens — nothing merges without Sam's approval | Her own code before opening a PR |
| **Never touches** | Design — Sam trusts Vismaya's eye | `lib/db/`, `lib/actions/`, `lib/supabase/`, `app/api/`, `middleware.ts`, `drizzle/` — CODEOWNERS will block the PR anyway |

The rule is simple: **if you didn't build the UI, don't touch it. If it isn't a page or a component, ping Sam.**

---

## 3. One-Time Laptop Setup

### Step 1 — Install Node.js
Download from **nodejs.org → LTS version** → install it.
Verify: open Terminal → `node -v` → should show v20 or higher.

### Step 2 — Clone the repo
```bash
git clone https://github.com/Sam1512-tech/Aarna.git
cd Aarna
npm install
```

### Step 3 — Create your .env.local
Create a file called `.env.local` in the Aarna folder (same level as `package.json`).
Paste exactly this (Sam will send you these values over WhatsApp):

```
NEXT_PUBLIC_SUPABASE_URL=https://ytabocdpyqxpqckbzryk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0YWJvY2RweXF4cHFja2J6cnlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNTU5ODMsImV4cCI6MjA5MzgzMTk4M30.K1zt1iltRgEQlerGz9dG0KGsJs3tDgNsd0u-sH3Qh_c
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Never share these keys publicly. Never commit .env.local to git — it is already gitignored.**

### Step 4 — Start the dev server
```bash
npm run dev
```
Open **http://localhost:3000** in your browser. You should see the Aarna home page running.

### Step 5 — VS Code extensions to install
- **Tailwind CSS IntelliSense** — autocomplete for all class names
- **ES7+ React/Redux/React-Native snippets** — faster component boilerplate
- **Prettier** — auto-format on save

---

## 4. Site Structure — Pages You Build

### Storefront (`app/(storefront)/`)
| Page | Route | What it shows |
|---|---|---|
| Home | `/` | Anything you want |
| Shop / PLP | `/shop/[category]` | Product grid — content + filters your call. Use `getProducts({ category })` |
| Product / PDP | `/product/[slug]` | Product detail — use `getProductBySlug(slug)` |
| Cart | `/cart` | Cart — use `getCart()` and the cart actions |
| Checkout | `/checkout` | Address form + payment — calls `initCheckout()` to open Razorpay |
| Account | `/account` (+ `/orders`, `/addresses`, `/wishlist`, `/returns` under it) | Customer account — use `lib/actions/account.ts` |
| Auth | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback` | Auth forms + email-verify callback |
| Legal | `/privacy`, `/terms`, `/returns`, `/shipping` | Static text pages (client provides copy) |

**Only constraint:** the route paths above must be exactly as listed (the backend / Supabase Auth redirects / webhook return URLs all assume them). Everything inside each page — layout, content, components, styling — is your call.

### Admin (`app/admin/`)
| Page | What it manages |
|---|---|
| `/admin/products` | Create / edit products, variants, images. **Form must include MRP (separate from selling price), fabric composition, care instructions** — legal requirement under India's Legal Metrology Act. Product detail page needs a **"Print Tags"** button that generates the hang-tag label PDF. |
| `/admin/orders` | View orders, update status, generate invoice |
| `/admin/inventory` | Stock levels, low-stock alerts |
| `/admin/coupons` | Create discount codes |
| `/admin/banners` | Homepage hero carousel |
| `/admin/collections` | Seasonal groupings |
| `/admin/reviews` | Approve / reject customer reviews |

shadcn/ui is already installed if you want to use it for admin to move faster — but not required.

---

## 5. Categories Are Dynamic (one architectural rule)

The whole point of the admin is that the client can self-manage. Categories are the cleanest example: when the client adds "Kurta Sets" via admin tomorrow, it should appear everywhere on the site automatically — navbar, homepage, PLP filters, footer — without anyone touching code.

**The rule:** anywhere you display category names or links, fetch them with `getCategories()`. Don't hardcode "Dresses" or "Tops" as strings anywhere — not even as fallbacks. If `getCategories()` returns an empty array, render nothing (or a generic placeholder), but never invent category names in code.

That's the only frontend rule — and it's an architecture rule, not a design one.

---

## 6. Backend Contract Updates (read this if you started before Week 2)

A few backend changes happened after this doc was first written. If anything in your existing components looks like it doesn't match these, update it.

### Checkout requires `email`
`initCheckout()` now takes an `email` field on `CheckoutInitInput`, separate from the shipping address. The shipping address has a phone but no email. The checkout form must collect the customer's email — that's where the order confirmation + invoice PDF goes.

```ts
await initCheckout({
  email: "customer@example.com",   // ← new, required
  shippingAddress: { ... },
  billingSameAsShipping: true,
  whatsappOptIn: false,
})
```

### `applyCoupon()` now returns a `discount` amount
The return shape changed:
```ts
{ ok: boolean; message: string; cart: CartState; discount: number }
```
`discount` is the calculated discount in paise. When a coupon is applied, show:
- `subtotal − discount + shipping = total`
Don't try to compute the discount yourself — the server does it (flat vs percent, capped at subtotal).

### Razorpay handle from `initCheckout()`
On success, `initCheckout` returns `{ summary, razorpay }`. Use the `razorpay` object to open the Razorpay modal:
```ts
const { summary, razorpay } = await initCheckout({ ... })

const rzp = new Razorpay({
  key: razorpay.razorpayKeyId,
  amount: razorpay.amount,           // already in paise
  currency: razorpay.currency,       // "INR"
  order_id: razorpay.razorpayOrderId,
  name: "Aarna",
  description: razorpay.orderNumber,
  // ...callbacks
})
rzp.open()
```
The webhook on the server side handles confirmation + emailing the invoice — your client just needs to redirect to a thank-you page on success.

### Wishlist is variant-level, not product-level
Wishlist actions take a `variantId` (specific size/color), not a `productId`. So the heart button on PDP should only be enabled after the user picks a size.

---

## 7. How You Talk to the Backend (Important)

You **never** write SQL, database queries, or call Razorpay/Supabase/Cloudinary directly. Sam builds typed functions in `lib/actions/` — you import and call them like any async function.

```tsx
// Server component — just await the action
import { getProducts } from "@/lib/actions/products"

export default async function ShopPage() {
  const { items, total } = await getProducts({ category: "dresses", page: 1 })
  return <ProductGrid products={items} />
}
```

```tsx
// Client component — call on user interaction
"use client"
import { addToCart } from "@/lib/actions/cart"
import { useCartStore } from "@/store/cart"

function AddToBagButton({ variantId }: { variantId: string }) {
  const setCart = useCartStore(s => s.setCart)
  return (
    <button onClick={async () => {
      const cart = await addToCart(variantId, 1)
      setCart(cart)
    }}>
      Add to Bag
    </button>
  )
}
```

**If you need data that doesn't exist yet in `lib/actions/`, message Sam on WhatsApp.** Don't write it yourself. While waiting, use the mock data in `lib/mocks/` — it is shaped exactly like the real data.

### Useful utilities already built
- `cn(...classes)` from `@/lib/utils` — combine Tailwind classes safely
- `formatINR(amount)` from `@/lib/utils` — always use this for prices, never format manually

---

## 8. Daily Git Workflow

Every day, every task:

```bash
# 1. Always start from fresh main
git checkout main
git pull

# 2. Create a branch for your task
git checkout -b fe/homepage-hero        # or fe/product-card, fe/navbar, etc.

# 3. Work. Commit often — small commits are fine
git add -A
git commit -m "fe: homepage hero carousel layout"

# 4. Push your branch
git push -u origin fe/homepage-hero

# 5. Open a Pull Request on GitHub
# Go to github.com/Sam1512-tech/Aarna
# You'll see a banner: "fe/homepage-hero had recent pushes → Compare & pull request"
# Click it → write a short description → Submit
# Sam gets notified, reviews, and merges
```

### Branch naming
Always prefix with `fe/`:
- `fe/navbar` — building the navbar
- `fe/homepage` — homepage sections
- `fe/product-card` — product card component
- `fe/plp-filters` — PLP filter sidebar

### Staying in sync with Sam's changes (important)

Sam is constantly merging backend changes to `main` while you build. If you fork from a stale `main`, you'll be coding against an outdated contract and your PR will conflict at review time.

**The one rule that keeps you out of trouble:**
> Always pull `main` before starting a new task or opening a new PR.

**Morning ritual — run this before opening your editor:**
```bash
cd ~/Documents/Aarna
git checkout main
git pull
```

**Starting a new task — fork from a freshly-pulled main:**
```bash
git checkout main
git pull
git checkout -b fe/new-task
```

**Your current branch is getting old and main has moved on?** Pull main into your branch:
```bash
git checkout fe/your-branch
git fetch origin
git merge origin/main
# resolve conflicts in VS Code, then:
git add -A && git commit -m "merge main"
```

**Get notified when things change:**
1. Visit [github.com/Sam1512-tech/Aarna](https://github.com/Sam1512-tech/Aarna), click the **Watch** button (top-right), pick **"All Activity"** — you'll get an email on every merge.
2. Sam will WhatsApp you only when a merge changes the FE/BE contract (i.e., section 6 changes, new actions, renamed types). Not every merge — that's noise.

### PR rules
- One feature per PR — don't bundle 5 things into one
- Write a 1-line description: what you built and what it looks like
- Don't merge your own PRs — wait for Sam

---

## 9. Build Order — Suggestion, Not Rule

This is just an ordering that tends to work well — later pages depend on earlier components. Feel free to rearrange if you have your own flow.

| Priority | What | Why |
|---|---|---|
| 1 | Navbar + footer | Every page uses them |
| 2 | Homepage | Sets the look + feel for everything else |
| 3 | Product card component | Reused on homepage AND PLP |
| 4 | PLP (product listing) | Depends on product card |
| 5 | PDP (product detail) | Depends on product card |
| 6 | Cart drawer / page | Depends on PDP |
| 7 | Checkout | Depends on cart |
| 8 | Account pages | Independent |
| 9 | Admin screens | shadcn/ui is installed if you want to move fast |

---

## 10. When You Are Stuck

1. Re-read this document
2. Check `lib/mocks/` for data shapes
3. Search the repo — something similar may already exist
4. Message Sam on WhatsApp — always better to ask than to guess

**Do not:**
- Install npm packages without asking Sam first
- Edit `package.json`, `tsconfig.json`, `next.config.ts`, `.github/`, `middleware.ts`
- Push directly to `main` — the branch protection will block it anyway
- Hardcode category names (use `getCategories()`)

---

*Internal document · Solaris Studios · not for client distribution*
