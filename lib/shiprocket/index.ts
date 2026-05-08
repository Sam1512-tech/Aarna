// Thin Shiprocket REST client. Auth token is fetched on demand and cached in-memory.
const SHIPROCKET_BASE = "https://apiv2.shiprocket.in/v1/external";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || !password) {
    throw new Error("SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD not set.");
  }
  const res = await fetch(`${SHIPROCKET_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Shiprocket auth failed: ${res.status}`);
  const json = await res.json();
  cachedToken = {
    token: json.token,
    expiresAt: Date.now() + 9 * 24 * 60 * 60 * 1000, // ~10 day token, refresh early
  };
  return json.token;
}

async function shiprocketFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${SHIPROCKET_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(
      `Shiprocket ${path} failed: ${res.status} ${await res.text()}`,
    );
  }
  return res.json() as Promise<T>;
}

export interface ServiceabilityInput {
  pickupPincode: string;
  deliveryPincode: string;
  weightKg: number;
  cod?: boolean;
}

export async function checkServiceability(input: ServiceabilityInput) {
  // TODO(backend): map response to { serviceable, etaDays, cheapestRate }.
  return shiprocketFetch(
    `/courier/serviceability/?pickup_postcode=${input.pickupPincode}&delivery_postcode=${input.deliveryPincode}&weight=${input.weightKg}&cod=${input.cod ? 1 : 0}`,
  );
}

export async function createShiprocketOrder(_payload: unknown) {
  // TODO(backend): map internal order shape to Shiprocket /orders/create/adhoc payload.
  return shiprocketFetch(`/orders/create/adhoc`, {
    method: "POST",
    body: JSON.stringify(_payload),
  });
}

export async function generateAwb(_shipmentId: string, _courierId: string) {
  // TODO(backend): /courier/assign/awb
  return shiprocketFetch(`/courier/assign/awb`, {
    method: "POST",
    body: JSON.stringify({ shipment_id: _shipmentId, courier_id: _courierId }),
  });
}

export async function requestReversePickup(_payload: unknown) {
  // TODO(backend): /orders/create/return
  return shiprocketFetch(`/orders/create/return`, {
    method: "POST",
    body: JSON.stringify(_payload),
  });
}
