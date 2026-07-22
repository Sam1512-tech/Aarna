"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { AdminCard } from "@/components/admin/admin-primitives";
import { Field, TextInput } from "@/components/admin/admin-form";

const PRESETS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_financial_year", label: "This financial year" },
  { value: "custom", label: "Custom range" },
] as const;

const FORMATS = [
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "Excel" },
  { value: "pdf", label: "PDF" },
] as const;

type Preset = (typeof PRESETS)[number]["value"];
type Format = (typeof FORMATS)[number]["value"];

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-4 py-2 text-xs uppercase tracking-wide transition duration-300 ${
        active
          ? "border-maroon bg-maroon text-cream"
          : "border-cocoa/25 bg-cream text-charcoal/70 hover:border-cocoa"
      }`}
    >
      {children}
    </button>
  );
}

function ReportCard({
  type,
  title,
  description,
}: {
  type: "general" | "gst";
  title: string;
  description: string;
}) {
  const [preset, setPreset] = useState<Preset>("this_month");
  const [format, setFormat] = useState<Format>("csv");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const isCustom = preset === "custom";
  const customReady = !isCustom || (from.length > 0 && to.length > 0);

  const params = new URLSearchParams({ type, format, preset });
  if (isCustom && customReady) {
    params.set("from", from);
    params.set("to", to);
  }
  const href = `/api/admin/reports/export?${params.toString()}`;

  return (
    <AdminCard>
      <h2 className="font-display text-xl uppercase text-maroon">{title}</h2>
      <p className="mt-1 text-sm text-charcoal/60">{description}</p>

      <div className="mt-5">
        <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
          Period
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Pill key={p.value} active={preset === p.value} onClick={() => setPreset(p.value)}>
              {p.label}
            </Pill>
          ))}
        </div>
      </div>

      {isCustom ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="From">
            <TextInput
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={to || undefined}
            />
          </Field>
          <Field label="To">
            <TextInput
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              min={from || undefined}
            />
          </Field>
        </div>
      ) : null}

      <div className="mt-5">
        <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
          Format
        </span>
        <div className="mt-2 flex gap-2">
          {FORMATS.map((f) => (
            <Pill key={f.value} active={format === f.value} onClick={() => setFormat(f.value)}>
              {f.label}
            </Pill>
          ))}
        </div>
      </div>

      <a
        href={customReady ? href : undefined}
        aria-disabled={!customReady}
        target="_blank"
        rel="noreferrer"
        className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-cocoa px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-cream shadow-[0_10px_28px_rgba(140,106,90,0.22)] transition duration-500 hover:bg-cocoa/90 ${
          customReady ? "" : "pointer-events-none opacity-50"
        }`}
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Download report
      </a>
      {isCustom && !customReady ? (
        <p className="mt-2 text-xs text-charcoal/50">Pick both a start and end date first.</p>
      ) : null}
    </AdminCard>
  );
}

export function ReportsView() {
  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      <ReportCard
        type="general"
        title="General sales report"
        description="Every order in the period — customer, items, amounts, and status. Good for a business overview or reconciling with Razorpay settlements."
      />
      <ReportCard
        type="gst"
        title="GST sales register"
        description="Invoice-level GST breakup (taxable value, CGST/SGST/IGST by rate, HSN, buyer GSTIN) — the format your accountant needs to file GSTR-1/GSTR-3B. Only includes orders that were actually invoiced."
      />
    </div>
  );
}
