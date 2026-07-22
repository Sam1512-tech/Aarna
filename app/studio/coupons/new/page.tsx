import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { NewCouponForm } from "./new-coupon-form";

export const metadata: Metadata = { title: "Admin · add coupon" };

export default function AdminNewCouponPage() {
  return (
    <div>
      <AdminPageHeader
        eyebrow="Commerce · coupons"
        title="Add coupon"
        intro="Discount codes customers apply at checkout."
      />
      <NewCouponForm />
    </div>
  );
}
