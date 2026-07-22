import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { NewCollectionForm } from "./new-collection-form";

export const metadata: Metadata = { title: "Admin · add collection" };

export default function AdminNewCollectionPage() {
  return (
    <div>
      <AdminPageHeader
        eyebrow="Content · collections"
        title="Add collection"
        intro="Curated groupings — the summer capsule, slow essentials, festive picks. Products get added after the collection is created."
      />
      <NewCollectionForm />
    </div>
  );
}
