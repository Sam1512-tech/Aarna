import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { getAdminOrderDetail } from "@/lib/actions/admin/orders";
import { OrderDetailView } from "./order-detail-view";

export const metadata: Metadata = { title: "admin · order" };

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const order = await getAdminOrderDetail(orderNumber).catch(() => null);
  if (!order) notFound();

  return (
    <div>
      <AdminPageHeader
        eyebrow="commerce · orders"
        title={`order ${order.orderNumber}`}
        intro={`placed ${new Date(order.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })} IST`}
      />
      <OrderDetailView order={order} />
    </div>
  );
}
