"use client";

import { useRouter } from "next/navigation";
import { ReturnQcPanel } from "@/components/admin/return-qc-panel";
import { markReturnQc } from "@/lib/actions/admin/returns";
import { actionErrorMessage } from "@/lib/action-error";

export function ReturnQcTrigger({
  returnId,
  refundAmount,
  type,
}: {
  returnId: string;
  refundAmount: number;
  type: "return" | "exchange";
}) {
  const router = useRouter();

  return (
    <ReturnQcPanel
      refundAmount={refundAmount}
      type={type}
      onSubmit={async (payload) => {
        try {
          await markReturnQc(returnId, payload);
          router.refresh();
        } catch (err) {
          throw new Error(actionErrorMessage(err, "couldn't submit qc"));
        }
      }}
    />
  );
}
