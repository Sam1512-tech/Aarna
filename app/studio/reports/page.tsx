import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { ReportsView } from "./reports-view";

export const metadata: Metadata = { title: "Admin · reports" };

export default function AdminReportsPage() {
  return (
    <div>
      <AdminPageHeader
        eyebrow="Business"
        title="Reports"
        intro="Download sales data for a period, ready to send straight to your accountant."
      />
      <ReportsView />
    </div>
  );
}
