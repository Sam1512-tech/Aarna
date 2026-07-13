import type { Metadata } from "next";
import { LegalList, LegalPage } from "@/components/storefront/legal-page";

export const metadata: Metadata = {
  title: "Fabric care guide",
  description:
    "How to keep your Aarna pieces feeling and looking their best — washing, drying, and everyday care.",
};

export default function FabricCarePage() {
  return (
    <LegalPage
      eyebrow="resources"
      title="Fabric Care Guide"
      intro="Slow-made pieces last longer when they're loved gently. A few small rituals will keep the fabric, cut, and colour of your Aarna clothing feeling like new."
    >
      <LegalList
        items={[
          "Dry clean recommended for first wash.",
          "Hand wash separately in cold water using mild detergent.",
          "Dry in shade to preserve color and fabric quality.",
        ]}
      />
    </LegalPage>
  );
}
