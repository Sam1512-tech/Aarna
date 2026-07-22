import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { getAdminBannerDetail } from "@/lib/actions/admin/banners";
import { BannerEditView } from "./banner-edit-view";

export const metadata: Metadata = { title: "Admin · edit banner" };

export default async function AdminEditBannerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const banner = await getAdminBannerDetail(id);
  if (!banner) notFound();

  return (
    <div>
      <AdminPageHeader
        eyebrow="Content · banners"
        title={banner.title ?? "edit banner"}
        intro="Homepage hero and promo banner. Cloudinary URLs for now — richer upload UI comes next."
      />
      <BannerEditView banner={banner} />
    </div>
  );
}
