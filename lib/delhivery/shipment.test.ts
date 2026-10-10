import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actionErrorMessage } from "@/lib/action-error";
import {
  cleanConsigneeCity,
  cleanConsigneeText,
  createShipment,
  fetchWaybill,
} from "./index";

describe("cleanConsigneeText", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanConsigneeText("No 70 2nd NR Complex Rajgopalnagar ")).toBe(
      "No 70 2nd NR Complex Rajgopalnagar",
    );
    expect(cleanConsigneeText("  Main   road\tPeenya ")).toBe(
      "Main road Peenya",
    );
  });
});

describe("cleanConsigneeCity", () => {
  it("drops the district qualifier (the shape that AARNA-001322 carried)", () => {
    expect(cleanConsigneeCity("BENGALURU URBAN")).toBe("BENGALURU");
    expect(cleanConsigneeCity("Bengaluru Rural")).toBe("Bengaluru");
    expect(cleanConsigneeCity(" Bangalore  Urban ")).toBe("Bangalore");
  });

  it("leaves ordinary cities alone, including trailing-space ones", () => {
    expect(cleanConsigneeCity("Bangalore")).toBe("Bangalore");
    expect(cleanConsigneeCity("Bengaluru ")).toBe("Bengaluru");
    expect(cleanConsigneeCity("Chamarajanagar")).toBe("Chamarajanagar");
  });

  it("never reduces a value to nothing", () => {
    expect(cleanConsigneeCity("Urban")).toBe("Urban");
  });
});

describe("createShipment / fetchWaybill error reporting", () => {
  const input = {
    orderNumber: "AARNA-001322",
    waybill: "55173410002726",
    name: "Nagaveni Nagu",
    address: "No 70 2nd NR Complex Rajgopalnagar , Main road Peenya ",
    pincode: "560058",
    city: "BENGALURU URBAN",
    state: "Karnataka",
    phone: "8152933777",
    totalAmount: 1648,
    weightGrams: 450,
    paymentMode: "COD" as const,
    codAmount: 1648,
  };

  beforeEach(() => {
    vi.stubEnv("DELHIVERY_API_TOKEN", "test-token");
    vi.stubEnv("DELHIVERY_PICKUP_NAME", "Aarna Godown");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function mockFetch(status: number, body: unknown) {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
      json: async () => JSON.parse(text),
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("sends a cleaned consignee and returns the confirmed waybill", async () => {
    const fetchMock = mockFetch(200, {
      success: true,
      packages: [{ waybill: "55173410002726", status: "Success" }],
    });

    await expect(createShipment(input)).resolves.toEqual({
      waybill: "55173410002726",
    });

    const sent = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    const shipment = JSON.parse(sent.get("data")!).shipments[0];
    expect(shipment.city).toBe("BENGALURU");
    expect(shipment.add).toBe(
      "No 70 2nd NR Complex Rajgopalnagar , Main road Peenya",
    );
    expect(shipment.payment_mode).toBe("COD");
    expect(shipment.cod_amount).toBe(1648);
  });

  it("surfaces Delhivery's own rejection reason to the admin", async () => {
    mockFetch(200, {
      success: false,
      packages: [
        {
          waybill: "55173410002726",
          status: "Fail",
          remarks: ["Invalid address", "Pin not mapped"],
        },
      ],
    });

    const err = await createShipment(input).catch((e) => e);
    expect(actionErrorMessage(err, "fallback")).toBe(
      "Delhivery rejected this shipment: Invalid address, Pin not mapped",
    );
  });

  it("surfaces a 4xx body from Delhivery", async () => {
    mockFetch(400, '{"rmk":"Invalid pickup location"}');

    const err = await createShipment(input).catch((e) => e);
    const message = actionErrorMessage(err, "fallback");
    expect(message).toContain("HTTP 400");
    expect(message).toContain("Invalid pickup location");
  });

  it("does not dump a 5xx HTML page on the admin", async () => {
    mockFetch(502, "<html><body>Bad gateway ...</body></html>");

    const err = await createShipment(input).catch((e) => e);
    const message = actionErrorMessage(err, "fallback");
    expect(message).toContain("try again in a minute");
    expect(message).not.toContain("<html>");
  });

  it("explains a waybill-allocation failure too", async () => {
    mockFetch(401, '{"detail":"Invalid token"}');

    const err = await fetchWaybill().catch((e) => e);
    expect(actionErrorMessage(err, "fallback")).toContain(
      "Couldn't get a waybill number",
    );
  });

  it("leaves non-Delhivery failures masked (not safe to show)", async () => {
    vi.stubEnv("DELHIVERY_API_TOKEN", "");

    const err = await fetchWaybill().catch((e) => e);
    expect(actionErrorMessage(err, "fallback")).toBe("fallback");
  });
});
