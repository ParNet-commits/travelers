import { describe, expect, it } from "vitest";
import { formatPlannerDayNumbers, money, provenanceLabel, shortModelName } from "../src/lib/format.js";

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
});

