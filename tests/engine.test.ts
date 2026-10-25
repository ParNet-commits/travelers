import { describe, expect, it } from "vitest";
import { buildItinerary } from "../server/engine/build.js";
import type { NormalizedDraft } from "../server/engine/context.js";
import { convertMinor, formatMoney, scaleMinor, toMicro } from "../server/engine/money.js";
import { normalizeDraft } from "../server/engine/normalize.js";
import { applyDirectives, fallbackDirectives, greedyDraft, mergeDirectives, minimumFeasibleCostMinor, repairToFit } from "../server/engine/repair.js";
import { buildTradeoffs } from "../server/engine/tradeoff.js";
import { hoursLabel, openWindow, parseOsmOpeningHours } from "../server/engine/time.js";
import { FX, riyaLikeRequest, testContext } from "./fixtures.js";

const meta = { round: 0, mode: "live" as const, model: "test", deterministicFallback: false };

/** The "LLM-style" first draft: premium hotel, palace (stairs), fort (stairs), too ambitious. */
const ambitious: NormalizedDraft = {
  lodgingId: "testville:hotel-premium",
  mealTier: "premium",
  days: [
    { dayIndex: 0, theme: "Arrival", placeIds: ["testville:lake-boat", "testville:sunset"] },
    { dayIndex: 1, theme: "Palace day", placeIds: ["testville:palace", "testville:temple"] },
    { dayIndex: 2, theme: "Views", placeIds: ["testville:fort", "testville:garden"] },
    { dayIndex: 3, theme: "Departure", placeIds: ["testville:market"] },
  ],
};

describe("money", () => {
  it("parses rates exactly and converts with half-up rounding", () => {
    expect(toMicro("88")).toBe(88_000_000n);
    expect(toMicro("94.751")).toBe(94_751_000n);
    expect(convertMinor(8800, "INR", "USD", FX)).toBe(100); // INR 88.00 -> USD 1.00
    expect(convertMinor(4400, "INR", "USD", FX)).toBe(50);
    expect(convertMinor(4, "INR", "USD", FX)).toBe(0); // 0.045 cents -> 0
    expect(convertMinor(100, "USD", "INR", FX)).toBe(8800);
    expect(convertMinor(12345, "USD", "USD", FX)).toBe(12345);
  });
  it("rejects floats and negatives", () => {
    expect(() => convertMinor(1.5, "USD", "INR", FX)).toThrow();
    expect(() => convertMinor(-1, "USD", "INR", FX)).toThrow();
    expect(() => toMicro("1e3")).toThrow();
  });
  it("formats deterministically", () => {
    expect(formatMoney(124000, "USD")).toBe("USD 1,240.00");
    expect(formatMoney(-34000, "USD")).toBe("USD -340.00");
    expect(scaleMinor(2500, 3.4)).toBe(8500);
  });
});

describe("opening hours", () => {
  it("parses common OSM forms and refuses complex ones", () => {
    expect(parseOsmOpeningHours("24/7")?.rules[0]?.days).toHaveLength(7);
    const h = parseOsmOpeningHours("Tu-Su 10:00-17:00; Mo off");
    expect(h?.rules[0]?.days.sort()).toEqual([0, 2, 3, 4, 5, 6]);
    expect(parseOsmOpeningHours("Mo-Fr 09:00-12:00,14:00-18:00")?.rules[0]).toMatchObject({ open: "09:00", close: "18:00" });
    expect(parseOsmOpeningHours("sunrise-sunset")).toBeNull();
    expect(parseOsmOpeningHours("Mo-Fr 09:00-17:00; PH off")?.rules).toHaveLength(1);
  });
  it("computes windows per date", () => {
    const h = parseOsmOpeningHours("Tu-Su 10:00-17:00");
    expect(openWindow(h, "2026-11-16")).toBe("closed"); // Monday
    expect(openWindow(h, "2026-11-17")).toEqual({ openMin: 600, closeMin: 1020 });
    expect(openWindow(null, "2026-11-17")).toBe("unknown");
    expect(hoursLabel(h)).toBe("Closed Mon 10:00-17:00");
  });
});

describe("normalizeDraft", () => {
  it("drops unknown ids, removes duplicates, accepts case variants", () => {
    const ctx = testContext();
    const r = normalizeDraft(
      {
        lodgingId: "TESTVILLE:HOTEL-MID",
        mealTier: "mid",
        days: [
          { dayIndex: 0, theme: "A", placeIds: ["testville:garden", "made-up:place", "Testville:Garden"] },
          { dayIndex: 9, theme: "bad day", placeIds: ["testville:museum"] },
        ],
        rationale: "x",
      },
      ctx,
    );
    expect(r.draft.lodgingId).toBe("testville:hotel-mid");
    expect(r.draft.days).toHaveLength(4);
    expect(r.draft.days[0]?.placeIds).toEqual(["testville:garden"]);
    expect(r.unknownIds).toContain("made-up:place");
    expect(r.duplicates).toContain("testville:garden");
    expect(r.lodgingReplaced).toBe(false);
  });
  it("replaces an unknown hotel with the cheapest acceptable one", () => {
    const ctx = testContext();
    const r = normalizeDraft({ lodgingId: "ritz", mealTier: "mid", days: [], rationale: "" }, ctx);
    expect(r.lodgingReplaced).toBe(true);
    expect(r.draft.lodgingId).toBe("testville:hotel-mid"); // budget guesthouse is not step-free
  });
});

describe("scheduler + rules", () => {
  it("flags the ambitious draft on budget and step-free access", () => {
    const ctx = testContext();
    const itin = buildItinerary(ambitious, ctx, meta);
    const codes = itin.validation.violations.filter((v) => v.severity === "hard").map((v) => v.code);
    expect(itin.validation.passed).toBe(false);
    expect(codes).toContain("BUDGET_EXCEEDED");
    expect(codes).toContain("NOT_STEP_FREE");
    expect(itin.costs.grandTotalMinor).toBeGreaterThan(itin.costs.budgetMinor);
    expect(itin.validation.outcomes).toHaveLength(9);
    // totals are exact integer sums of the lines
    const sum = itin.costs.lines.reduce((s, l) => s + l.amount.amountMinor, 0);
    expect(sum).toBe(itin.costs.grandTotalMinor);
  });
  it("produces monotonic times with lunch and transit", () => {
    const ctx = testContext();
    const itin = buildItinerary(ambitious, ctx, meta);
    for (const day of itin.days) {
      let last = "00:00";
      for (const item of day.items) {
        expect(item.start >= last).toBe(true);
        expect(item.end >= item.start).toBe(true);
        last = item.end;
      }
    }
    const day2 = itin.days[1];
    expect(day2?.items.some((i) => i.kind === "meal")).toBe(true);
    expect(day2?.items[0]?.kind).toBe("transit");
  });
  it("flags a closed museum on Monday", () => {
    const ctx = testContext(riyaLikeRequest({ accessibility: { stepFreeRequired: false, maxWalkKmPerDay: null, notes: "" } }));
    const d: NormalizedDraft = {
      lodgingId: "testville:hotel-mid",
      mealTier: "budget",
      days: [{ dayIndex: 0, theme: "", placeIds: ["testville:museum"] }, { dayIndex: 1, theme: "", placeIds: [] }, { dayIndex: 2, theme: "", placeIds: [] }, { dayIndex: 3, theme: "", placeIds: [] }],
    };
    const itin = buildItinerary(d, ctx, meta);
    expect(itin.validation.violations.some((v) => v.code === "CLOSED_ON_DATE")).toBe(true);
  });
});

describe("self-correction primitives", () => {
  it("fallback critic directives fix the ambitious draft in one round", () => {
    const ctx = testContext();
    const first = buildItinerary(ambitious, ctx, meta);
    const directives = fallbackDirectives(first, ambitious, ctx);
    expect(directives.some((d) => d.op === "change_lodging")).toBe(true);
    expect(directives.some((d) => d.op === "swap_place" || d.op === "drop_place")).toBe(true);
    const fixed = applyDirectives(ambitious, directives, ctx);
    const second = buildItinerary(fixed.draft, ctx, { ...meta, round: 1 });
    expect(second.validation.hardCount).toBeLessThan(first.validation.hardCount);
  });
  it("applyDirectives rejects unknown ids and non step-free replacements", () => {
    const ctx = testContext();
    const r = applyDirectives(
      ambitious,
      [
        { op: "swap_place", placeId: "testville:palace", replacementId: "nowhere:1", reason: "", addresses: ["R6"] },
        { op: "swap_place", placeId: "testville:palace", replacementId: "testville:fort", reason: "", addresses: ["R6"] },
        { op: "change_lodging", lodgingId: "testville:hotel-budget", reason: "", addresses: ["R1"] },
      ],
      ctx,
    );
    expect(r.applied).toHaveLength(0);
    expect(r.rejected).toHaveLength(3);
  });
  it("mergeDirectives lets newer directives override older ones on the same target", () => {
    const merged = mergeDirectives(
      [{ op: "change_lodging", lodgingId: "a", reason: "", addresses: ["R1"] }, { op: "drop_place", placeId: "x", reason: "", addresses: ["R1"] }],
      [{ op: "change_lodging", lodgingId: "b", reason: "", addresses: ["R1"] }, { op: "swap_place", placeId: "y", replacementId: "x", reason: "", addresses: ["R6"] }],
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((d) => d.op === "change_lodging")).toMatchObject({ lodgingId: "b" });
  });
  it("repairToFit and greedyDraft always reach a passing plan for a feasible budget", () => {
    const ctx = testContext();
    const repaired = repairToFit(ambitious, ctx, { fixBudget: true, meta });
    expect(repaired.itinerary.validation.passed).toBe(true);
    const greedy = repairToFit(greedyDraft(ctx, { lodgingTier: "mid", mealTier: "mid" }), ctx, { fixBudget: true, meta });
    expect(greedy.itinerary.validation.passed).toBe(true);
    expect(greedy.itinerary.days.reduce((s, d) => s + d.metrics.visits, 0)).toBeGreaterThan(0);
  });
  it("trade-off options are both fully valid itineraries", () => {
    const ctx = testContext();
    const options = buildTradeoffs(ambitious, ctx, meta);
    expect(options.length).toBeGreaterThanOrEqual(1);
    for (const o of options) expect(o.itinerary.validation.passed).toBe(true);
    const a = options.find((o) => o.id === "A");
    if (a) expect(a.deltaBudgetMinor).toBeGreaterThan(0);
  });
  it("detects impossible budgets before any LLM call", () => {
    const ctx = testContext(riyaLikeRequest({ budget: { amountMinor: 10000, currency: "USD" } }));
    expect(minimumFeasibleCostMinor(ctx)).toBeGreaterThan(10000);
  });
});
