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

export async function createShipment(input: CreateShipmentInput) {
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

  return delhiveryFetch(`/api/cmu/create.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

// ── Tracking ───────────────────────────────────────────────────────────────

export async function trackShipment(waybill: string) {
  return delhiveryFetch(
    `/api/v1/packages/json/?waybill=${encodeURIComponent(waybill)}`,
  );
}

// ── Reverse pickup (returns) ────────────────────────────────────────────────

export async function requestReversePickup(_input: unknown) {
  // TODO(backend): reverse shipments reuse /api/cmu/create.json with an RVP
  // (return) shipment payload. Wire once the returns flow goes live.
  throw new Error("Delhivery requestReversePickup not yet implemented.");
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
  if (statusType === "DL" || s.includes("delivered")) return "delivered";
  if (s.includes("out for delivery") || s.includes("dispatched"))
    return "out_for_delivery";
  if (statusType === "RT" || s.includes("rto") || s.includes("returned"))
    return "returned";
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
