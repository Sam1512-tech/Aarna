import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { getAdminHomepageVideoSlots } from "@/lib/actions/admin/homepage-video-slots";
import { HomepageVideosView } from "./homepage-videos-view";

export const metadata: Metadata = { title: "Admin · homepage videos" };

export default async function AdminHomepageVideosPage() {
  const { left, right } = await getAdminHomepageVideoSlots().catch(() => ({
    left: null,
    right: null,
  }));

  return (
    <div>
      <AdminPageHeader
        eyebrow="Homepage"
        title="Homepage videos"
        intro={`The "made to live in" section — two videos side by side (stacked on mobile). Either side left blank shows a placeholder instead of dead space.`}
      />
      <HomepageVideosView left={left} right={right} />
    </div>
  );
}
