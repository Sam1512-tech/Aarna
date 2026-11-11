"use client";

import { useRouter } from "next/navigation";
import { ReturnQcPanel } from "@/components/admin/return-qc-panel";
import { markReturnQc } from "@/lib/actions/admin/returns";
import { actionErrorMessage } from "@/lib/action-error";

export function ReturnQcTrigger({
  returnId,
  refundAmount,
  returnShippingFee,
  type,
}: {
  returnId: string;
  refundAmount: number;
  returnShippingFee: number;
  type: "return" | "exchange";
}) {
  const router = useRouter();

  return (
    <ReturnQcPanel
      refundAmount={refundAmount}
      returnShippingFee={returnShippingFee}
      type={type}
      onSubmit={async (payload) => {
        try {
          await markReturnQc(returnId, payload);
          router.refresh();
        } catch (err) {
          throw new Error(actionErrorMessage(err, "Couldn't submit QC"));
        }
      }}
    />
  );
}
