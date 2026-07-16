"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  ReturnExchangeModal,
  type RequestableItem,
} from "@/components/storefront/return-exchange-modal";

interface Props {
  item: RequestableItem;
}

export function ReturnExchangeItemButton({ item }: Props) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={submitted}
        className="inline-flex items-center gap-1.5 rounded-full border border-cocoa/22 bg-cream px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-cocoa transition duration-500 hover:border-maroon hover:text-maroon disabled:opacity-50"
      >
        <RotateCcw className="h-3 w-3" aria-hidden="true" />
        {submitted ? "requested" : "return or exchange"}
      </button>

      <ReturnExchangeModal
        open={open}
        onClose={() => setOpen(false)}
        eligibleItems={[item]}
        presetItemId={item.orderItemId}
        onSubmitted={() => {
          setSubmitted(true);
          setOpen(false);
        }}
      />
    </>
  );
}
