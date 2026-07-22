-- Row Level Security for Aarna
-- ---------------------------------------------------------------------------
-- Security model: the storefront and admin NEVER talk to the database directly
-- from the browser. Every read/write goes through a server action, which uses
-- the Drizzle connection (the `postgres` table-owner role). Table owners bypass
-- RLS, so these policies do not affect the app's own queries.
--
-- What RLS protects here is Supabase's auto-exposed PostgREST API
-- (https://<ref>.supabase.co/rest/v1/<table>). The anon key is public and ships
-- to the browser, so without RLS anyone could read/write every table over REST.
-- Enabling RLS with NO anon/authenticated policies makes the default DENY:
-- the public REST surface returns nothing, while server actions keep full access.
--
-- Supabase Auth itself lives in the `auth` schema and is unaffected by this.
--
-- Idempotent — safe to re-run. Apply with: npm run db:rls
-- If a future feature genuinely needs direct client access to a table, add a
-- scoped policy for that table here (e.g. customers may read their own row).

ALTER TABLE public.addresses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_video_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists            ENABLE ROW LEVEL SECURITY;
