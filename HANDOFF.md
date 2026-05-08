# Handoff — Frontend Dev (Vismaya)

This is your day-1 onboarding for the Aarna repo. Read once, then use as reference.

## What you need to install

- **Node.js 20+** ([nodejs.org](https://nodejs.org))
- **Git** (probably already installed; check with `git --version`)
- **VS Code** (or your editor) with the **Tailwind CSS IntelliSense** extension

## First-time setup

```bash
git clone https://github.com/Sam1512-tech/Aarna.git
cd Aarna
npm install
cp .env.example .env.local
# fill .env.local from the shared 1Password vault
npm run dev
```

Visit `http://localhost:3000`. You should see the Aarna home page.

## Where you work

You only ever open files in these folders:

| Folder | What goes here |
|---|---|
| `app/(storefront)/` | Public site pages: home, shop, product, cart, checkout, account |
| `app/(auth)/` | Login, signup, password reset |
| `app/admin/` | Admin dashboard pages (use shadcn/ui — fast) |
| `components/` | Reusable UI components |
| `hooks/` | Custom React hooks (e.g. `useCart`, `useUser`) |
| `store/` | Zustand stores |
| `app/globals.css` | Design tokens (colors, fonts) |

**Do not edit:** `lib/db/`, `lib/actions/`, `lib/supabase/`, `lib/razorpay/`, `lib/shiprocket/`, `lib/whatsapp/`, `lib/resend/`, `lib/cloudinary/`, `app/api/`, `middleware.ts`, `drizzle/`, `drizzle.config.ts`. These are Sam's. CODEOWNERS will block you anyway.

## How you talk to the backend

You **never** write SQL, Drizzle queries, or call third-party APIs directly. You import typed async functions from `lib/actions/` and call them. That's it.

```tsx
// Example: fetch products on a server component
import { getProducts } from "@/lib/actions/products";

export default async function ShopPage() {
  const { items } = await getProducts({ category: "dresses" });
  return <ProductGrid products={items} />;
}
```

```tsx
// Example: call from a client component
"use client";
import { addToCart } from "@/lib/actions/cart";

function AddToBagButton({ variantId }: { variantId: string }) {
  return (
    <button
      onClick={async () => {
        const cart = await addToCart(variantId, 1);
        // update Zustand store with `cart`
      }}
    >
      Add to bag
    </button>
  );
}
```

If you need a server action that doesn't exist yet, **ping Sam** — don't try to write it yourself.

## What's already there for you

- **Design tokens** in `app/globals.css` — use `bg-ivory`, `bg-sand`, `text-maroon`, `font-display`, `font-sans`, etc.
- **Fonts** — Cormorant Garamond (display) and Poppins (body) are preloaded.
- **Layouts** — storefront + admin shells are stubbed in `app/(storefront)/layout.tsx` and `app/admin/layout.tsx`.
- **`cn()` helper** in `lib/utils.ts` for combining Tailwind classes.
- **`formatINR()`** in `lib/utils.ts` for prices (use this everywhere — the brand uses ₹).
- **Stub server actions** for products, cart, auth, checkout. They return empty/typed data right now so you can build UI before the backend is wired.

## Daily workflow

```bash
git checkout main
git pull
git checkout -b fe/<what-you're-doing>     # e.g. fe/product-card
# ...code...
git add -A
git commit -m "fe: build product card"
git push -u origin fe/<branch>
# open a PR on GitHub, request Sam's review
```

Keep PRs small. One feature per PR. Don't let branches sit for days.

## Design reference

Mood board / brand guide: ask Sam for the file. Key points:

- **Palette:** Ivory `#FAF7F2`, Sand `#E0D0C6`, Light Taupe `#C8BFB3`, Warm Grey `#9D948E`, Maroon `#4B1323`, Black `#111111`.
- **Display font:** Cormorant Garamond (serifs, headings, brand wordmark).
- **Body font:** Poppins (light/regular/medium).
- **Voice:** clean, understated, elegant, modern, exclusive.
- **Layout:** lots of whitespace, generous margins, image-led, soft borders, subtle hover states.

## When you're stuck

1. Read this file again.
2. Search the repo for existing examples.
3. Ask Sam.

Don't install new npm packages without asking. Don't change `package.json`, `tsconfig.json`, or anything in `.github/`.
