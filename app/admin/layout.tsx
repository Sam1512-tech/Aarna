import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getCurrentAdmin } from "@/lib/actions/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/admin");

  // Authenticated, but admin access requires a row in the admins table.
  // A logged-in customer who hits /admin gets bounced to the storefront.
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/");

  const displayName = admin.email?.split("@")[0] ?? "admin";
  return <AdminShell displayName={displayName}>{children}</AdminShell>;
}
