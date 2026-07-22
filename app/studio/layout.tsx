import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getCurrentAdmin } from "@/lib/actions/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Deliberately not listed in robots.ts's disallow rules (see the comment
// there) — this noindex is the actual guard against the path ever showing up
// in search results, rather than a public file pointing straight at it.
export const metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/studio");

  // Authenticated, but admin access requires a row in the admins table.
  // A logged-in customer who hits /studio gets bounced to the storefront.
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/");

  const displayName = admin.email?.split("@")[0] ?? "admin";
  return <AdminShell displayName={displayName}>{children}</AdminShell>;
}
