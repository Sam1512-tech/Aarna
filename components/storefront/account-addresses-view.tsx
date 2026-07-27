"use client";

import { Check, MapPin, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from "@/lib/actions/account";
import type { AddressInput, AddressRow } from "@/lib/types";
import { useModalLock } from "@/hooks/use-modal-lock";

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
    if (!window.confirm("Delete this address?")) return;
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
          your addresses · {addresses.length}
        </p>
        <button
          type="button"
          onClick={() => setEditor({ mode: "create" })}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-cocoa px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cream transition duration-500 hover:bg-cocoa/90"
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
      <p
        className={`font-display text-xl text-maroon ${address.isDefault ? "pr-24" : ""}`}
      >
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

      <div className="mt-4 flex flex-wrap gap-3 border-t border-cocoa/10 pt-4 text-[11px] font-medium uppercase tracking-[0.16em]">
        {!address.isDefault ? (
          <button
            type="button"
            onClick={onMakeDefault}
            disabled={disabled}
            className="soft-link -my-1.5 py-1.5 text-cocoa disabled:opacity-50"
          >
            Make default
          </button>
        ) : null}
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="-my-1.5 inline-flex items-center gap-1 py-1.5 text-charcoal/70 hover:text-cocoa disabled:opacity-50"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="-my-1.5 ml-auto inline-flex items-center gap-1 py-1.5 text-charcoal/60 hover:text-burnt-red disabled:opacity-50"
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

  // This component only exists in the tree while the editor is open (the
  // parent conditionally renders it), so mounting IS the "open" state —
  // lock body scroll and enable Escape-to-close for the whole lifetime.
  useModalLock(true, onCancel);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    onSave(form);
  }

  // Portaled to document.body — this modal is opened from pages wrapped in
  // the site-wide `.paper-grain` class (app/globals.css), which sets
  // `isolation: isolate` so its own grain-texture pseudo-element stays
  // contained. That isolation also traps any `position: fixed` descendant
  // rendered inline (not portaled) into a new stacking context, so its
  // z-index is only ever compared against siblings *inside* that context —
  // it can never paint above the site header (fixed, z-50, outside the
  // trap), regardless of how high a z-index the modal itself uses. Confirmed
  // live via elementFromPoint hit-testing at the close/save button's exact
  // coordinates across 4 viewport sizes (837x478, 1280x800, 375x500,
  // 667x320): the header always won, never the button underneath it. This
  // is the same root cause already diagnosed once for the PLP mobile filter
  // sheet (see the comment in plp-view.tsx) — fixed there by moving the
  // sheet to be a JSX sibling of the .paper-grain section; a portal achieves
  // the same escape here without depending on this component's host page
  // structure, since AddressEditor (like the other account-area modals) is
  // rendered from several different pages.
  return createPortal(
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
        // dvh (not vh) on mobile — mobile Safari/Chrome's collapsing URL bar
        // means plain vh can size this taller than what's actually visible,
        // matching return-exchange-modal.tsx/size-guide-modal.tsx. Header and
        // footer are separate non-scrolling flex children (below); only the
        // body between them scrolls, so they can never be scrolled out of view.
        className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-cream shadow-[0_-18px_60px_rgba(43,38,35,0.16)] md:max-h-[92vh] md:rounded-3xl"
      >
        <div className="flex items-start justify-between border-b border-cocoa/10 px-6 py-5 md:px-8">
          <h2 className="font-display text-3xl text-maroon">
            {initial ? "Edit address" : "Add address"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-cocoa hover:bg-cocoa/10"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 md:p-8">
          <div className="space-y-3">
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
        </div>

        {/* Extra bottom clearance for the iPhone home-indicator safe area
            (the app opts into viewport-fit=cover) — same fix already
            applied to the cart toast + return-exchange-modal footer. */}
        <div
          className="mt-auto flex gap-3 border-t border-cocoa/10 px-6 pt-4 md:px-8"
          style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        >
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
            className="flex-1 rounded-2xl bg-cocoa py-3 text-[11px] font-medium uppercase tracking-[0.24em] text-cream shadow-[0_18px_40px_rgba(140,106,90,0.24)] transition duration-500 hover:bg-cocoa/90 disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              {pending ? (
                "Saving…"
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
    </div>,
    document.body,
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
