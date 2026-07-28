// Thin Delhivery REST client.
//
// Delhivery authenticates with a single API token (no email/password login round-trip):
//   Authorization: Token <DELHIVERY_API_TOKEN>
// The token comes from the Delhivery panel → Settings → API once KYC is approved.
//
// Base URLs:
//   Production: https://track.delhivery.com
//   Staging:    https://staging-express.delhivery.com
// Override with DELHIVERY_API_BASE_URL.

const DEFAULT_BASE = "https://track.delhivery.com";

function baseUrl(): string {
  return process.env.DELHIVERY_API_BASE_URL?.replace(/\/$/, "") ?? DEFAULT_BASE;
}

function apiToken(): string {
  const token = process.env.DELHIVERY_API_TOKEN;
  if (!token) throw new Error("DELHIVERY_API_TOKEN not set.");
  return token;
}

async function delhiveryFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${apiToken()}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(
      `Delhivery ${path} failed: ${res.status} ${await res.text()}`,
    );
  }
  return res.json() as Promise<T>;
}

// ── Pincode serviceability ─────────────────────────────────────────────────

export interface ServiceabilityResult {
  serviceable: boolean; // prepaid serviceable — Aarna is prepaid-only
  prepaid: boolean;
  pickup: boolean;
  district?: string;
  stateCode?: string;
}

interface PinResponse {
  delivery_codes: Array<{
    postal_code: {
      pin: number;
      pre_paid: string; // "Y" | "N"
      cod: string;
      pickup: string;
      district?: string;
      state_code?: string;
    };
  }>;
}

export async function checkServiceability(
  pincode: string,
): Promise<ServiceabilityResult> {
  const data = await delhiveryFetch<PinResponse>(
    `/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(pincode)}`,
  );
  const pc = data.delivery_codes?.[0]?.postal_code;
  if (!pc) return { serviceable: false, prepaid: false, pickup: false };
  return {
    serviceable: pc.pre_paid === "Y",
    prepaid: pc.pre_paid === "Y",
    pickup: pc.pickup === "Y",
    district: pc.district,
    stateCode: pc.state_code,
  };
}

// ── Waybill (AWB) allocation ───────────────────────────────────────────────

export async function fetchWaybill(): Promise<string> {
  // Returns a single fresh waybill number to attach to a shipment.
  const data = await delhiveryFetch<{ waybill?: string } | string>(
    `/waybill/api/bulk/json/?count=1`,
  );
  // Delhivery returns either a bare quoted string or { waybill }.
  if (typeof data === "string") return data.replace(/"/g, "");
  if (data.waybill) return data.waybill;
  throw new Error("Delhivery waybill allocation returned no waybill");
}

// ── Create forward shipment (manifest) ─────────────────────────────────────

export interface CreateShipmentInput {
  orderNumber: string;
  waybill?: string;
  name: string;
  address: string;
  pincode: string;
  city: string;
  state: string;
  phone: string;
  totalAmount: number; // in rupees
  weightGrams: number;
}

export async function createShipment(
  input: CreateShipmentInput,
): Promise<{ waybill: string }> {
  const pickupName = process.env.DELHIVERY_PICKUP_NAME;
  if (!pickupName) throw new Error("DELHIVERY_PICKUP_NAME not set.");

  // Delhivery's create endpoint is form-encoded: `format=json&data=<JSON>`.
  const payload = {
    pickup_location: { name: pickupName },
    shipments: [
      {
        name: input.name,
        order: input.orderNumber,
        waybill: input.waybill ?? "",
        add: input.address,
        pin: input.pincode,
        city: input.city,
        state: input.state,
        country: "India",
        phone: input.phone,
        payment_mode: "Prepaid", // Aarna is prepaid-only (no COD)
        total_amount: input.totalAmount,
        weight: input.weightGrams,
        // TODO(backend): add per-item HSN/product lines once the warehouse is live.
      },
    ],
  };

  const body = new URLSearchParams({
    format: "json",
    data: JSON.stringify(payload),
  });

  // Delhivery's bulk create endpoint can return HTTP 200 while still
  // reporting a per-shipment failure inside the response body (bad pincode,
  // serviceability issue, etc.) — an HTTP-level success here does NOT mean
  // the shipment was actually accepted. requestReversePickup below already
  // validates this correctly for the reverse flow; this forward path
  // previously didn't, so a rejected shipment would silently look like a
  // success to the caller, which saves a fake AWB and marks the order
  // "shipped" with no real shipment behind it.
  const result = await delhiveryFetch<{
    packages?: Array<{ waybill?: string; status?: string; remarks?: string[] }>;
  }>(`/api/cmu/create.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const pkg = result.packages?.[0];
  if (!pkg?.waybill) {
    throw new Error(
      `Delhivery shipment creation failed: ${pkg?.remarks?.join(", ") ?? "no waybill returned"}`,
    );
  }

  return { waybill: pkg.waybill };
}

// ── Tracking ───────────────────────────────────────────────────────────────

export async function trackShipment(waybill: string) {
  return delhiveryFetch(
    `/api/v1/packages/json/?waybill=${encodeURIComponent(waybill)}`,
  );
}

// ── Reverse pickup (returns) ────────────────────────────────────────────────

// Registered studio address — same one on every GST invoice
// (lib/invoice/template.tsx). Reverse pickups return here regardless of
// which customer address the item ships from, so it's fine to inline
// rather than plumb through another env var.
const RETURN_TO = {
  name: "Aarna Label",
  address: "No. 3571, 1st H Cross, Behind Girinagar Police Station, Giri Nagar",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560085",
  phone: "7975639485",
};

export interface ReversePickupInput {
  orderNumber: string;
  waybill?: string;
  customerName: string;
  customerAddress: string;
  customerPincode: string;
  customerCity: string;
  customerState: string;
  customerPhone: string;
}

/**
 * Books a reverse pickup (RVP) — a courier collects the item FROM the
 * customer and delivers it back TO the studio. Same /api/cmu/create.json
 * endpoint as an outbound shipment, but with the roles reversed: `add`/
 * `pin`/`city`/`state`/`phone` describe where the courier picks up FROM
 * (the customer), and `return_*` describes where it's going TO (the
 * studio) — that's what tells Delhivery this is a return, not a delivery.
 *
 * Best-effort against Delhivery's documented RVP shape; verify against the
 * Delhivery panel/support on the first real pickup before relying on it —
 * same caveat as createShipment's per-item HSN TODO above.
 */
export async function requestReversePickup(input: ReversePickupInput) {
  const pickupName = process.env.DELHIVERY_PICKUP_NAME;
  if (!pickupName) throw new Error("DELHIVERY_PICKUP_NAME not set.");

  const waybill = input.waybill ?? (await fetchWaybill());

  const payload = {
    pickup_location: { name: pickupName },
    shipments: [
      {
        name: input.customerName,
        order: `${input.orderNumber}-RVP`,
        waybill,
        add: input.customerAddress,
        pin: input.customerPincode,
        city: input.customerCity,
        state: input.customerState,
        country: "India",
        phone: input.customerPhone,
        payment_mode: "Pickup",
        shipment_type: "Return",
        return_add: RETURN_TO.address,
        return_pin: RETURN_TO.pincode,
        return_city: RETURN_TO.city,
        return_state: RETURN_TO.state,
        return_country: "India",
        return_phone: RETURN_TO.phone,
        return_name: RETURN_TO.name,
      },
    ],
  };

  const body = new URLSearchParams({
    format: "json",
    data: JSON.stringify(payload),
  });

  const result = await delhiveryFetch<{
    packages?: Array<{ waybill?: string; status?: string; remarks?: string[] }>;
  }>(`/api/cmu/create.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const pkg = result.packages?.[0];
  if (!pkg?.waybill) {
    throw new Error(
      `Delhivery reverse pickup failed: ${pkg?.remarks?.join(", ") ?? "no waybill returned"}`,
    );
  }

  return { waybill: pkg.waybill };
}

// ── Status mapping (used by the webhook) ────────────────────────────────────

export type FulfillmentStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "returned";

/**
 * Maps a Delhivery scan status to our internal fulfillment status.
 * Delhivery's webhook sends Shipment.Status.Status (human label) and
 * Shipment.Status.StatusType (short code: UD/DL/RT/...). Returns null when the
 * status doesn't map to a meaningful change (so we leave the order untouched).
 */
export function mapDelhiveryStatus(
  status: string,
  statusType?: string,
): FulfillmentStatus | null {
  const s = status.toLowerCase();
  // RTO/returned-to-origin must be checked BEFORE the generic "delivered"
  // check. A completed RTO's own status text can legitimately contain the
  // word "delivered" (couriers commonly phrase it "Delivered to Consignor"
  // — the parcel was delivered, just back to the warehouse, not the
  // customer) — checking "delivered" first would misclassify that as a
  // customer delivery: the 3-day return window would start on a parcel the
  // customer never received, they'd get a false "your order arrived"
  // WhatsApp, and the RTO-inspection admin alert below would never fire.
  if (
    statusType === "RT" ||
    s.includes("rto") ||
    s.includes("returned") ||
    s.includes("consignor")
  )
    return "returned";
  if (statusType === "DL" || s.includes("delivered")) return "delivered";
  if (s.includes("out for delivery") || s.includes("dispatched"))
    return "out_for_delivery";
  if (s.includes("cancel")) return "cancelled";
  if (
    statusType === "UD" ||
    s.includes("transit") ||
    s.includes("manifested") ||
    s.includes("picked")
  )
    return "shipped";
  return null;
}
