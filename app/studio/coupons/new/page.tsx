import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { NewCouponForm } from "./new-coupon-form";

export const metadata: Metadata = { title: "admin · add coupon" };

export default function AdminNewCouponPage() {
  return (
    <div>
      <AdminPageHeader
        eyebrow="commerce · coupons"
        title="add coupon"
        intro="Discount codes customers apply at checkout."
      />
      <NewCouponForm />
    </div>
  );
}
