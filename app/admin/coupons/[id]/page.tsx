import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { getAdminCouponDetail } from "@/lib/actions/admin/coupons";
import { CouponEditView } from "./coupon-edit-view";

export const metadata: Metadata = { title: "admin · edit coupon" };

export default async function AdminEditCouponPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const coupon = await getAdminCouponDetail(id);
  if (!coupon) notFound();

  return (
    <div>
      <AdminPageHeader
        eyebrow="commerce · coupons"
        title={coupon.code}
        intro="Discount code customers apply at checkout."
      />
      <CouponEditView coupon={coupon} />
    </div>
  );
}
