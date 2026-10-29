import { describe, expect, it } from "vitest";
import { computePackingTip, formatPlannerDayNumbers, money, provenanceLabel, RULE_INFO, shortModelName } from "../src/lib/format.js";

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
  it("shifts 0-indexed Planner day numbers to 1-indexed (Day 1 to Day 4)", () => {
    const rawPlannerText = "Day 0 offers a relaxed lakeside walk. Day 1 focuses on City Palace. Day 2 provides ropeway. Day 3 explores crafts.";
    const expected = "Day 1 offers a relaxed lakeside walk. Day 2 focuses on City Palace. Day 3 provides ropeway. Day 4 explores crafts.";
    expect(formatPlannerDayNumbers(rawPlannerText)).toBe(expected);

    expect(formatPlannerDayNumbers("Planning Day 0 to Day 3 in Udaipur")).toBe("Planning Day 1 to Day 4 in Udaipur");
    expect(formatPlannerDayNumbers("Reduce walking distance on Day 0")).toBe("Reduce walking distance on Day 1");
    expect(formatPlannerDayNumbers("Day 1 to Day 4 already 1-indexed")).toBe("Day 1 to Day 4 already 1-indexed");
  });
  it("defines canonical names and descriptions for all rules R0 to R8", () => {
    const ruleIds = ["R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"] as const;
    for (const id of ruleIds) {
      expect(RULE_INFO[id].name).toBeTruthy();
      expect(RULE_INFO[id].description.length).toBeGreaterThan(15);
    }
  });
  it("computes packing tips according to weather criteria", () => {
    // Rain >= 30% -> Carry an umbrella
    expect(
      computePackingTip({ date: "2026-11-15", weatherCode: 61, label: "Rainy", tMaxC: 25, tMinC: 18, rainProbPct: 40 }),
    ).toBe("Carry an umbrella");

    // tMaxC >= 32 -> Sun hat and water
    expect(
      computePackingTip({ date: "2026-11-15", weatherCode: 0, label: "Clear", tMaxC: 34, tMinC: 22, rainProbPct: 5 }),
    ).toBe("Sun hat and water");

    // tMinC <= 15 -> Light jacket for the evening
    expect(
      computePackingTip({ date: "2026-11-15", weatherCode: 0, label: "Clear", tMaxC: 24, tMinC: 13, rainProbPct: 0 }),
    ).toBe("Light jacket for the evening");

    // No rule match -> null
    expect(
      computePackingTip({ date: "2026-11-15", weatherCode: 0, label: "Pleasant", tMaxC: 28, tMinC: 19, rainProbPct: 10 }),
    ).toBeNull();

    // Null/undefined weather -> null
    expect(computePackingTip(null)).toBeNull();
    expect(computePackingTip(undefined)).toBeNull();
  });
});

