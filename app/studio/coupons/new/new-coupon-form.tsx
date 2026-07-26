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

// Browser-local Y-M-D, not UTC — an admin picking "today" should mean their
// own today. This only constrains the picker UI; createCoupon independently
// re-validates server-side against IST, since a direct action call bypasses
// this entirely.
function todayDateInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function NewCouponForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [type, setType] = useState<CouponType>("percent");
  const [value, setValue] = useState("");
  const [minOrderRupees, setMinOrderRupees] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [perCustomerLimit, setPerCustomerLimit] = useState("1");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const today = todayDateInputValue();
  const codeValid = /^[A-Z0-9_-]{3,32}$/.test(code);
  const rawValue = Number.parseFloat(value);
  const valueValid =
    Number.isFinite(rawValue) &&
    rawValue > 0 &&
    (type === "percent" ? rawValue <= 100 : true);
  // Mirrors the server's "expiry must be after start" check — a light,
  // immediate UX signal only; createCoupon is the real enforcement.
  const rangeValid = !startsAt || !expiresAt || expiresAt > startsAt;
  const canSubmit = codeValid && valueValid && rangeValid && !pending;

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
          startsAt: startsAt ? new Date(startsAt) : null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          isActive,
        });
        router.push("/studio/coupons");
        router.refresh();
      } catch (err) {
        setError(
          actionErrorMessage(err, "Couldn't create coupon."),
        );
      }
    });
  }

  return (
    <FormShell onSubmit={handleSubmit}>
      <FormSection
        title="Code"
        description="3-32 characters, letters/digits/dash/underscore. Auto-uppercased."
      >
        <Field label="Coupon code" required wide>
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

      <FormSection title="Discount">
        <Field label="Type" required>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as CouponType)}
          >
            <option value="percent">Percentage off</option>
            <option value="flat">Flat rupee amount off</option>
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
          label="Minimum order (₹)"
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
          label="Starts on"
          hint="Optional — coupon can't be redeemed before this date."
        >
          <TextInput
            type="date"
            min={today}
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </Field>
        <Field
          label="Expires on"
          hint="Optional — coupon becomes invalid after this date."
          error={!rangeValid ? "Must be after the start date" : undefined}
        >
          <TextInput
            type="date"
            min={startsAt || today}
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Usage limits">
        <Field
          label="Total uses"
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
          label="Per customer"
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
          label="Active — customers can use this code right away"
          checked={isActive}
          onChange={setIsActive}
        />
      </FormSection>

      <SubmitBar
        cancelHref="/studio/coupons"
        pending={pending}
        label="Create coupon"
        error={error}
        disabled={!canSubmit}
      />
    </FormShell>
  );
}
