import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { NewBannerForm } from "./new-banner-form";

export const metadata: Metadata = { title: "Admin · add banner" };

export default function AdminNewBannerPage() {
  return (
    <div>
      <AdminPageHeader
        eyebrow="Content · banners"
        title="Add banner"
        intro="Homepage hero and promo banners. Cloudinary URLs for now — richer upload UI comes next."
      />
      <NewBannerForm />
    </div>
  );
}
