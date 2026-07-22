"use client";

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
import { updateCoupon, type Coupon } from "@/lib/actions/admin/coupons";
import { actionErrorMessage } from "@/lib/action-error";

type CouponType = "flat" | "percent";

function rupeesToPaise(v: string) {
  const num = Number.parseFloat(v);
  if (!Number.isFinite(num) || num < 0) return NaN;
  return Math.round(num * 100);
}
function paiseToRupees(p: number) {
  return (p / 100).toString();
}

function toDateInputValue(d: Date | string | null): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

export function CouponEditView({ coupon }: { coupon: Coupon }) {
  const [code, setCode] = useState(coupon.code);
  const [type, setType] = useState<CouponType>(coupon.type);
  const [value, setValue] = useState(
    coupon.type === "percent" ? String(coupon.value) : paiseToRupees(coupon.value),
  );
  const [minOrderRupees, setMinOrderRupees] = useState(
    coupon.minOrderAmount > 0 ? paiseToRupees(coupon.minOrderAmount) : "",
  );
  const [usageLimit, setUsageLimit] = useState(
    coupon.usageLimit ? String(coupon.usageLimit) : "",
  );
  const [perCustomerLimit, setPerCustomerLimit] = useState(
    String(coupon.perCustomerLimit),
  );
  const [expiresAt, setExpiresAt] = useState(toDateInputValue(coupon.expiresAt));
  const [isActive, setIsActive] = useState(coupon.isActive);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
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
    setSaved(null);
    startTransition(async () => {
      try {
        const numericValue =
          type === "percent" ? Math.round(rawValue) : rupeesToPaise(value);
        await updateCoupon(coupon.id, {
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
        setSaved("Saved.");
      } catch (err) {
        setError(actionErrorMessage(err, "couldn't save coupon."));
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
            className="max-w-[140px]"
          />
        </Field>
        <Field
          label="Expires on"
          hint="Optional — coupon becomes invalid after this date."
        >
          <TextInput
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Usage limits">
        <Field
          label="Total uses"
          hint={`Cap across all customers. Already used ${coupon.usedCount} time(s). Blank = unlimited.`}
        >
          <TextInput
            inputMode="numeric"
            value={usageLimit}
            onChange={(e) => setUsageLimit(e.target.value.replace(/\D/g, ""))}
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
            className="max-w-[140px]"
          />
        </Field>
        <CheckboxRow
          label="Active — customers can use this code right away"
          checked={isActive}
          onChange={setIsActive}
        />
      </FormSection>

      {saved ? <p className="text-xs text-cocoa">{saved}</p> : null}
      <SubmitBar
        cancelHref="/studio/coupons"
        pending={pending}
        label="Save changes"
        error={error}
        disabled={!canSubmit}
      />
    </FormShell>
  );
}
