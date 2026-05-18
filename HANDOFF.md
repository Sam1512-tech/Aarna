# Handoff — Frontend Dev (Vismaya)

Read this fully before writing a single line of code. Use it as your daily reference.

---

## 1. What We Are Building

**Aarna by Arpitha Abhishek** — a women's indo-western fashion e-commerce store for the Indian market.

- India-only, English, prices in ₹ (INR)
- Online payments only (UPI, cards, net banking via Razorpay — no cash on delivery)
- Customers: women shopping for dresses, co-ord sets, kurta sets, jackets, tops & tunics
- Brand personality: **Minimal. Modern. Refined.** — clean lines, elevated silhouettes, premium feel
- 10–12 week delivery timeline — we are already in Week 1

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

## 4. Design System — Use These, Don't Invent

Everything from the brand mood board is already coded into the project. Never hardcode a hex value.

### Colors (Tailwind classes)
| Token | Class | Hex | Use for |
|---|---|---|---|
| Ivory | `bg-ivory` / `text-ivory` | `#FAF7F2` | Page background |
| Sand | `bg-sand` / `text-sand` | `#E0D0C6` | Cards, subtle borders |
| Light Taupe | `bg-taupe` / `text-taupe` | `#C8BFB3` | Dividers, placeholder text |
| Warm Grey | `bg-warm-grey` / `text-warm-grey` | `#9D948E` | Secondary text, captions |
| Maroon | `bg-maroon` / `text-maroon` | `#4B1323` | Primary CTA buttons, links, brand accents |
| Black | `bg-ink` / `text-ink` | `#111111` | Body text, headings |

### Typography (Tailwind classes)
| Use | Class | Font |
|---|---|---|
| All headings, hero text, product titles | `font-display` | Cormorant Garamond |
| All body text, labels, buttons, nav | `font-sans` | Poppins |

```tsx
// Correct usage examples
<h1 className="font-display text-5xl font-medium text-ink">Effortless Silhouettes</h1>
<p className="font-sans text-sm text-warm-grey">Thoughtfully designed for every chapter of your life.</p>
<button className="font-sans text-xs tracking-widest bg-maroon text-ivory px-8 py-3">EXPLORE NOW</button>
```

### Layout principles from the mood board
- **Lots of whitespace** — generous padding, let things breathe
- **Image-led** — photos are the hero, text is secondary
- **Subtle** — no harsh shadows, no bright colors outside the palette
- **Hover states** — soft opacity or underline transitions, nothing jarring
- **Typography hierarchy** — display font for impact, Poppins for everything readable

---

## 5. Site Structure — Pages You Build

### Storefront (`app/(storefront)/`)
| Page | Route | What it shows |
|---|---|---|
| Home | `/` | Hero carousel, Shop by Category, New Arrivals, Trust badges |
| Shop / PLP | `/shop/[category]` | Product grid with filters (size, color, price) and sort |
| Product / PDP | `/product/[slug]` | Images, title, price, size picker, Add to Bag, fabric info |
| Cart | `/cart` | Line items, quantities, order summary, proceed to checkout |
| Checkout | `/checkout` | Address form, order review, Razorpay payment |
| Account | `/account` | Orders, wishlist, addresses, return requests |
| Auth | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback` | Auth forms + email-verify callback |
| Legal | `/privacy`, `/terms`, `/returns`, `/shipping` | Static text pages (client provides copy) |

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

**For admin pages — always use shadcn/ui components.** They are already installed. This cuts weeks off admin build time. Don't custom-design admin — functional and clean is enough.

---

## 6. Navigation Structure

Top navbar:
```
AARNA    New Arrivals    Shop ▾    Collections    Sale    🔍 👤 🤍 🛍
```

**"Shop ▾" is a dropdown — fully dynamic, never hardcoded.**
It fetches categories from the DB using `getCategories()` and renders each as a link.
Right now it shows: Dresses, Tops.
When the client adds a new category via admin later, it appears automatically — no code change needed.

**Important rule: never hardcode category names anywhere in the frontend.**
Always fetch from `getCategories()`. This applies to:
- The Shop dropdown in the navbar
- The "Shop by Category" grid on the homepage
- Any filter or category list on the PLP
- Footer shop links

Trust badges (bottom of homepage):
- 🚚 Complimentary Shipping — On orders above ₹2999
- 🔄 Easy Returns — 14 days return policy
- 🌿 Premium Fabrics — Quality you can feel
- 🔒 Secure Checkout — Multiple payment options

---

## 6.5 Backend Contract Updates (read this if you started before Week 2)

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

### PR rules
- One feature per PR — don't bundle 5 things into one
- Write a 1-line description: what you built and what it looks like
- Don't merge your own PRs — wait for Sam

---

## 9. Build Order — What to Build First

Work in this order. Don't jump ahead — later pages depend on earlier components.

| Priority | What | Why first |
|---|---|---|
| 1 | Navbar + footer | Every page uses them |
| 2 | Homepage | The client's reference design exists — closest to done |
| 3 | Product card component | Used on homepage AND PLP |
| 4 | PLP (product listing) | Depends on product card |
| 5 | PDP (product detail) | Depends on product card |
| 6 | Cart drawer / page | Depends on PDP |
| 7 | Checkout | Depends on cart |
| 8 | Account pages | Independent |
| 9 | Admin screens | Use shadcn — fastest section |

---

## 10. Your Day 1 Task — Homepage

Build `app/(storefront)/page.tsx`. It should have these sections top to bottom:

1. **Navbar** — logo left, nav links center (`New Arrivals`, `Shop ▾` dropdown with dynamic categories from `getCategories()`, `Collections`, `Sale`), icons right (search, account, wishlist, bag)
2. **Hero carousel** — full-width image slider, 3 slides, headline + subtext + CTA button
   - Slide 1: "New Collection — Effortless Silhouettes"
   - Use `bg-sand` as placeholder until real photos arrive
3. **Shop by Category** — 2 large tiles side by side (Dresses, Tops). Make them large since only 2 — each roughly half the screen width on desktop, full width stacked on mobile
   - Each tile: image + category name below
4. **Trust badges** — 4 badges in a row (Shipping, Returns, Fabrics, Checkout)
5. **Footer** — brand name, links, copyright

Use mock images as placeholders (gray boxes) — real product photography comes in Week 8.
Use the mock data from `lib/mocks/` for any product data.

---

## 11. When You Are Stuck

1. Re-read this document
2. Check `lib/mocks/` for data shapes
3. Search the repo — something similar may already exist
4. Message Sam on WhatsApp — always better to ask than to guess

**Do not:**
- Install npm packages without asking Sam first
- Edit `package.json`, `tsconfig.json`, `next.config.ts`, `.github/`, `middleware.ts`
- Push directly to `main` — the branch protection will block it anyway
- Hardcode colors, hex values, or font names — use the Tailwind tokens

---

*Internal document · Solaris Studios · not for client distribution*
