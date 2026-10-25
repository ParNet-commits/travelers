import { describe, expect, it } from "vitest";
import { money, provenanceLabel, shortModelName } from "../src/lib/format.js";

describe("UI formatting", () => {
  it("formats minor units with the currency's decimals", () => {
    expect(money(124000, "USD")).toBe("$1,240.00");
    expect(money(4_000_000, "INR")).toBe("₹40,000.00");
  });
  it("shortens model ids and labels provenance", () => {
    expect(shortModelName("nvidia/nemotron-3-super-120b-a12b")).toBe("Nemotron Super 120B");
    expect(shortModelName("rules-engine")).toBe("Rules engine");
    expect(provenanceLabel({ amountMinor: 1, currency: "USD", provenance: "estimate" })).toBe("Estimated");
  });
});
