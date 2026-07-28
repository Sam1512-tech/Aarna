import { describe, expect, it } from "vitest";
import { mapDelhiveryStatus } from "./index";

describe("mapDelhiveryStatus", () => {
  it("maps a real confirmed customer delivery to 'delivered'", () => {
    // Real payload shape from a live Delhivery tracking response
    // (order AARNA-001002, AWB 55173410000103, 2026-07-28).
    expect(mapDelhiveryStatus("Delivered to consignee", "DL")).toBe(
      "delivered",
    );
  });

  it("maps an RTO completion to 'returned', even when its own status text contains the word 'delivered'", () => {
    // Couriers commonly phrase a completed return-to-origin as "delivered to
    // consignor" (delivered — just back to the warehouse, not the customer).
    // Before the fix, checking "delivered" before RTO meant this would have
    // been misclassified as a customer delivery.
    expect(mapDelhiveryStatus("Delivered to Consignor", "RT")).toBe(
      "returned",
    );
    expect(mapDelhiveryStatus("RTO Delivered", "RT")).toBe("returned");
  });

  it("maps returned/RTO status text even without an explicit RT statusType", () => {
    expect(mapDelhiveryStatus("Shipment returned to origin")).toBe(
      "returned",
    );
    expect(mapDelhiveryStatus("RTO in transit")).toBe("returned");
  });

  it("maps out-for-delivery and dispatched statuses", () => {
    expect(mapDelhiveryStatus("Out for delivery")).toBe("out_for_delivery");
    expect(mapDelhiveryStatus("Dispatched")).toBe("out_for_delivery");
  });

  it("maps cancellation", () => {
    expect(mapDelhiveryStatus("Shipment cancelled")).toBe("cancelled");
  });

  it("maps in-transit/manifested/picked statuses to 'shipped'", () => {
    expect(mapDelhiveryStatus("Shipment picked up", "UD")).toBe("shipped");
    expect(mapDelhiveryStatus("In transit")).toBe("shipped");
    expect(mapDelhiveryStatus("Manifested")).toBe("shipped");
  });

  it("returns null for an unrecognized status", () => {
    expect(mapDelhiveryStatus("Something unexpected")).toBeNull();
  });
});
