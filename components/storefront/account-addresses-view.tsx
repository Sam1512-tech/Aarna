"use client";

import { Check, MapPin, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from "@/lib/actions/account";
import type { AddressInput } from "@/lib/types";

export interface AddressRow extends AddressInput {
  id: string;
  isDefault: boolean;
}

interface AccountAddressesViewProps {
  addresses: AddressRow[];
}

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; row: AddressRow };

export function AccountAddressesView({
  addresses: initial,
}: AccountAddressesViewProps) {
  const [addresses, setAddresses] = useState<AddressRow[]>(initial);
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function makeDefault(id: string) {
    startTransition(async () => {
      try {
        await setDefaultAddress(id);
        setAddresses((rows) =>
          rows.map((r) => ({ ...r, isDefault: r.id === id })),
        );
      } catch {
        setError("Couldn't update default address");
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm("delete this address?")) return;
    startTransition(async () => {
      try {
        await deleteAddress(id);
        setAddresses((rows) => rows.filter((r) => r.id !== id));
      } catch {
        setError("Couldn't delete address");
      }
    });
  }

  function saveNew(input: AddressInput & { isDefault: boolean }) {
    startTransition(async () => {
      try {
        const created = await createAddress(input);
        setAddresses((rows) => {
          const nextRows = input.isDefault
            ? rows.map((r) => ({ ...r, isDefault: false }))
            : rows;
          return [
            ...nextRows,
            { ...input, id: created.id, isDefault: input.isDefault },
          ];
        });
        setEditor({ mode: "closed" });
      } catch {
        setError("Couldn't save address");
      }
    });
  }

  function saveEdit(id: string, input: AddressInput & { isDefault: boolean }) {
    startTransition(async () => {
      try {
        await updateAddress(id, input);
        if (input.isDefault) {
          await setDefaultAddress(id);
        }
        setAddresses((rows) =>
          rows.map((r) =>
            r.id === id
              ? { ...r, ...input, isDefault: input.isDefault }
              : input.isDefault
                ? { ...r, isDefault: false }
                : r,
          ),
        );
        setEditor({ mode: "closed" });
      } catch {
        setError("Couldn't update address");
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
          your addresses · {addresses.length}
        </p>
        <button
          type="button"
          onClick={() => setEditor({ mode: "create" })}
          className="inline-flex items-center gap-2 rounded-full bg-maroon px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cream transition duration-500 hover:bg-maroon/90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add address
        </button>
      </div>

      {error ? (
        <p className="mt-4 text-xs text-burnt-red">{error}</p>
      ) : null}

      {addresses.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-2xl border border-cocoa/12 bg-cream/70 py-14 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-cocoa/20 text-cocoa">
            <MapPin className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-5 font-display text-2xl text-maroon">
            No addresses yet
          </h2>
          <p className="mt-2 max-w-xs text-sm text-charcoal/60">
            Add a delivery address to check out faster next time.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {addresses.map((addr) => (
            <AddressCard
              key={addr.id}
              address={addr}
              disabled={pending}
              onMakeDefault={() => makeDefault(addr.id)}
              onEdit={() => setEditor({ mode: "edit", row: addr })}
              onDelete={() => remove(addr.id)}
            />
          ))}
        </div>
      )}

      {editor.mode !== "closed" ? (
        <AddressEditor
          initial={editor.mode === "edit" ? editor.row : undefined}
          pending={pending}
          onCancel={() => setEditor({ mode: "closed" })}
          onSave={(input) =>
            editor.mode === "edit"
              ? saveEdit(editor.row.id, input)
              : saveNew(input)
          }
        />
      ) : null}
    </div>
  );
}

function AddressCard({
  address,
  disabled,
  onMakeDefault,
  onEdit,
  onDelete,
}: {
  address: AddressRow;
  disabled: boolean;
  onMakeDefault: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="relative rounded-2xl border border-cocoa/12 bg-cream p-5 shadow-[0_10px_28px_rgba(43,38,35,0.04)]">
      {address.isDefault ? (
        <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-cocoa/25 bg-cocoa/8 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-cocoa">
          <Star className="h-3 w-3" aria-hidden="true" />
          Default
        </span>
      ) : null}
      <p className="font-display text-xl text-maroon">
        {address.fullName}
      </p>
      <p className="mt-2 text-sm leading-6 text-charcoal/75">
        {address.line1}
        {address.line2 ? (
          <>
            <br />
            {address.line2}
          </>
        ) : null}
        <br />
        {address.city}, {address.state} {address.pincode}
      </p>
      <p className="mt-1 text-sm text-charcoal/55">{address.phone}</p>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-cocoa/10 pt-4 text-[11px] font-medium uppercase tracking-[0.16em]">
        {!address.isDefault ? (
          <button
            type="button"
            onClick={onMakeDefault}
            disabled={disabled}
            className="soft-link text-cocoa disabled:opacity-50"
          >
            Make default
          </button>
        ) : null}
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="inline-flex items-center gap-1 text-charcoal/70 hover:text-cocoa disabled:opacity-50"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="ml-auto inline-flex items-center gap-1 text-charcoal/60 hover:text-burnt-red disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
          Delete
        </button>
      </div>
    </article>
  );
}

function AddressEditor({
  initial,
  pending,
  onCancel,
  onSave,
}: {
  initial?: AddressRow;
  pending: boolean;
  onCancel: () => void;
  onSave: (input: AddressInput & { isDefault: boolean }) => void;
}) {
  const [form, setForm] = useState<AddressInput & { isDefault: boolean }>({
    fullName: initial?.fullName ?? "",
    phone: initial?.phone ?? "",
    line1: initial?.line1 ?? "",
    line2: initial?.line2 ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "",
    pincode: initial?.pincode ?? "",
    isDefault: initial?.isDefault ?? false,
  });
  const canSave =
    form.fullName.trim().length >= 2 &&
    /^\d{10}$/.test(form.phone) &&
    form.line1.trim().length >= 3 &&
    form.city.trim().length >= 2 &&
    form.state.trim().length >= 2 &&
    /^\d{6}$/.test(form.pincode);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    onSave(form);
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-charcoal/40 backdrop-blur-sm md:items-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label="Close"
        className="absolute inset-0"
      />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-lg rounded-t-3xl bg-cream p-6 shadow-[0_-18px_60px_rgba(43,38,35,0.16)] md:rounded-3xl md:p-8"
      >
        <div className="flex items-start justify-between">
          <h2 className="font-display text-3xl text-maroon">
            {initial ? "edit address" : "add address"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-cocoa hover:bg-cocoa/10"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <TextField
            label="Full name"
            value={form.fullName}
            onChange={(v) => setForm((f) => ({ ...f, fullName: v }))}
          />
          <TextField
            label="Phone (10 digits)"
            value={form.phone}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                phone: v.replace(/\D/g, "").slice(0, 10),
              }))
            }
            inputMode="numeric"
            maxLength={10}
          />
          <TextField
            label="Address line 1"
            value={form.line1}
            onChange={(v) => setForm((f) => ({ ...f, line1: v }))}
          />
          <TextField
            label="Address line 2 (optional)"
            value={form.line2 ?? ""}
            onChange={(v) => setForm((f) => ({ ...f, line2: v }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="City"
              value={form.city}
              onChange={(v) => setForm((f) => ({ ...f, city: v }))}
            />
            <TextField
              label="State"
              value={form.state}
              onChange={(v) => setForm((f) => ({ ...f, state: v }))}
            />
          </div>
          <TextField
            label="Pin code (6 digits)"
            value={form.pincode}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                pincode: v.replace(/\D/g, "").slice(0, 6),
              }))
            }
            inputMode="numeric"
            maxLength={6}
          />
        </div>

        <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm text-charcoal/70">
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={(e) =>
              setForm((f) => ({ ...f, isDefault: e.target.checked }))
            }
            className="h-4 w-4 accent-cocoa"
          />
          Make this my default address
        </label>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-cocoa/24 bg-cream py-3 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave || pending}
            className="flex-1 rounded-2xl bg-maroon py-3 text-[11px] font-medium uppercase tracking-[0.24em] text-cream shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-500 hover:bg-maroon/90 disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              {pending ? (
                "saving…"
              ) : (
                <>
                  Save
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </>
              )}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  inputMode,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
        {label}
      </span>
      <input
        type="text"
        value={value}
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa"
      />
    </label>
  );
}
