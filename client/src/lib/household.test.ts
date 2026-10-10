import { describe, expect, it } from "vitest";
import { buildAddressPayload, serverErrorText } from "./household";

const empty = { line1: "", line2: "", city: "", region: "", postalCode: "", country: "" };

describe("buildAddressPayload", () => {
  it("trims fields, drops empty optionals and adds timezone", () => {
    expect(
      buildAddressPayload(
        { ...empty, line1: "  1 Main St ", city: " Austin", country: "USA ", line2: "  ", postalCode: " 78701 " },
        "America/Chicago",
      ),
    ).toEqual({ line1: "1 Main St", city: "Austin", country: "USA", postalCode: "78701", timezone: "America/Chicago" });
  });
  it("keeps all optionals when filled and omits timezone when unknown", () => {
    const p = buildAddressPayload({ line1: "a", line2: "Apt 2", city: "b", region: "TX", postalCode: "1", country: "c" });
    expect(p).toEqual({ line1: "a", line2: "Apt 2", city: "b", region: "TX", postalCode: "1", country: "c" });
    expect("timezone" in p).toBe(false);
  });
});

describe("serverErrorText", () => {
  it("extracts the JSON error field", () => {
    expect(serverErrorText(new Error('409: {"error":"Add an address first"}'))).toBe("Add an address first");
  });
  it("falls back to the raw body", () => {
    expect(serverErrorText(new Error("500: boom"))).toBe("boom");
  });
});
