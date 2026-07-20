"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CheckboxRow,
  Field,
  FormSection,
  FormShell,
  Select,
  SubmitBar,
  TextInput,
} from "@/components/admin/admin-form";
import { createCoupon } from "@/lib/actions/admin/coupons";
import { actionErrorMessage } from "@/lib/action-error";

type CouponType = "flat" | "percent";

function rupeesToPaise(v: string) {
  const num = Number.parseFloat(v);
  if (!Number.isFinite(num) || num < 0) return NaN;
  return Math.round(num * 100);
}

export function NewCouponForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [type, setType] = useState<CouponType>("percent");
  const [value, setValue] = useState("");
  const [minOrderRupees, setMinOrderRupees] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [perCustomerLimit, setPerCustomerLimit] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const codeValid = /^[A-Z0-9_-]{3,32}$/.test(code);
  const rawValue = Number.parseFloat(value);
  const valueValid =
    Number.isFinite(rawValue) &&
    rawValue > 0 &&
    (type === "percent" ? rawValue <= 100 : true);
  const canSubmit = codeValid && valueValid && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const numericValue =
          type === "percent"
            ? Math.round(rawValue)
            : rupeesToPaise(value);
        await createCoupon({
          code: code.toUpperCase(),
          type,
          value: numericValue,
          minOrderAmount:
            minOrderRupees.length > 0 ? rupeesToPaise(minOrderRupees) : 0,
          usageLimit:
            usageLimit.length > 0 ? Number.parseInt(usageLimit, 10) : null,
          perCustomerLimit:
            perCustomerLimit.length > 0
              ? Number.parseInt(perCustomerLimit, 10)
              : 1,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          isActive,
        });
        router.push("/admin/coupons");
        router.refresh();
      } catch (err) {
        setError(
          actionErrorMessage(err, "couldn't create coupon."),
        );
      }
    });
  }

  return (
    <FormShell onSubmit={handleSubmit}>
      <FormSection
        title="code"
        description="3-32 characters, letters/digits/dash/underscore. Auto-uppercased."
      >
        <Field label="coupon code" required wide>
          <TextInput
            value={code}
            onChange={(e) =>
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))
            }
            placeholder="WELCOME10"
            autoFocus
          />
        </Field>
      </FormSection>

      <FormSection title="discount">
        <Field label="type" required>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as CouponType)}
          >
            <option value="percent">percentage off</option>
            <option value="flat">flat rupee amount off</option>
          </Select>
        </Field>
        <Field
          label={type === "percent" ? "value (%)" : "value (₹)"}
          required
          hint={type === "percent" ? "1-100" : "e.g. 200 for ₹200 off"}
        >
          <TextInput
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={type === "percent" ? "10" : "200"}
            className="max-w-[140px]"
          />
        </Field>
        <Field
          label="minimum order (₹)"
          hint="Order subtotal required to redeem. Leave blank for none."
        >
          <TextInput
            inputMode="decimal"
            value={minOrderRupees}
            onChange={(e) => setMinOrderRupees(e.target.value)}
            placeholder="1500"
            className="max-w-[140px]"
          />
        </Field>
        <Field
          label="expires on"
          hint="Optional — coupon becomes invalid after this date."
        >
          <TextInput
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="usage limits">
        <Field
          label="total uses"
          hint="Cap across all customers. Blank = unlimited."
        >
          <TextInput
            inputMode="numeric"
            value={usageLimit}
            onChange={(e) =>
              setUsageLimit(e.target.value.replace(/\D/g, ""))
            }
            placeholder="unlimited"
            className="max-w-[140px]"
          />
        </Field>
        <Field
          label="per customer"
          hint="How many times one customer can use it."
        >
          <TextInput
            inputMode="numeric"
            value={perCustomerLimit}
            onChange={(e) =>
              setPerCustomerLimit(e.target.value.replace(/\D/g, ""))
            }
            placeholder="1"
            className="max-w-[140px]"
          />
        </Field>
        <CheckboxRow
          label="active — customers can use this code right away"
          checked={isActive}
          onChange={setIsActive}
        />
      </FormSection>

      <SubmitBar
        cancelHref="/admin/coupons"
        pending={pending}
        label="create coupon"
        error={error}
        disabled={!canSubmit}
      />
    </FormShell>
  );
}
