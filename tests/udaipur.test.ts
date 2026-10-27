/**
 * Hero story verification for Udaipur curated pack.
 * Validates feasibility under Riya's budget (USD 900, step-free access required, 4 days / 3 nights).
 */
import { describe, expect, it } from "vitest";
import { buildItinerary } from "../server/engine/build.js";
import { formatMoney } from "../server/engine/money.js";
import type { NormalizedDraft } from "../server/engine/context.js";
import { greedyDraft, minimumFeasibleCostMinor, repairToFit } from "../server/engine/repair.js";
import { UDAIPUR } from "../server/data/cities/udaipur.js";
import { FX_TABLE } from "../server/data/fx.js";
import { buildPlanningContext } from "../server/orchestrator/context.js";
import { riyaPreset } from "../replay/presets.js";

const meta = { round: 0, mode: "live" as const, model: "test", deterministicFallback: false };

describe("Udaipur hero story verification", () => {
  const todayDate = new Date();
  const todayIso = todayDate.toISOString().slice(0, 10);
  const request = riyaPreset(todayDate);

  const ctx = buildPlanningContext({
    runId: "run_udaipur_hero_test",
    request,
    destinationName: "Udaipur",
    center: UDAIPUR.center,
    pack: UDAIPUR,
    osmPlaces: [],
    matrix: null,
    weather: [],
    advisories: [],
    extraEvidence: [],
    rankedIds: [],
    vibes: ["romantic", "calm"],
    fx: FX_TABLE,
    today: todayIso,
  });

  it("a) minimumFeasibleCostMinor(ctx) < 90000 (USD 900 can cover the basics)", () => {
    const minCost = minimumFeasibleCostMinor(ctx);
    console.log(`[Udaipur Test a] Minimum feasible cost: ${formatMoney(minCost, "USD")} (${minCost} cents)`);
    expect(minCost).toBeLessThan(90000);
  });

  it("b) repairToFit(greedyDraft(ctx, { lodgingTier: 'mid', mealTier: 'mid' }), ctx, { fixBudget: true, meta }) returns an itinerary whose validation.passed is true", () => {
    const greedy = greedyDraft(ctx, { lodgingTier: "mid", mealTier: "mid" });
    const repaired = repairToFit(greedy, ctx, { fixBudget: true, meta });

    if (!repaired.itinerary.validation.passed) {
      console.error("[Udaipur Test b] Validation failed with violations:", repaired.itinerary.validation.violations);
      console.log("[Udaipur Test b] Costs breakdown:", JSON.stringify(repaired.itinerary.costs, null, 2));
    }

    console.log(`[Udaipur Test b] Repaired mid-tier total cost: ${formatMoney(repaired.itinerary.costs.grandTotalMinor, "USD")}`);
    console.log(`[Udaipur Test b] Repaired lodging: ${repaired.itinerary.lodging.name} (${repaired.itinerary.lodging.stepFree})`);
    console.log(`[Udaipur Test b] Validation passed: ${repaired.itinerary.validation.passed}`);

    expect(repaired.itinerary.validation.passed).toBe(true);
  });

  it("c) a draft using the most expensive premium hotel and premium meals with the first 3 ranked places per day has an R1 BUDGET_EXCEEDED violation", () => {
    // Find the most expensive premium hotel
    const premiumHotels = [...ctx.lodging.values()].filter((l) => l.tier === "premium");
    const mostExpensiveHotel = premiumHotels.sort(
      (a, b) => b.nightlyPerRoom.amountMinor - a.nightlyPerRoom.amountMinor,
    )[0];
    if (!mostExpensiveHotel) throw new Error("No premium hotel found in Udaipur pack");

    // Draft using most expensive hotel, premium meals, and first 3 ranked places per day
    const expensiveDraft: NormalizedDraft = {
      lodgingId: mostExpensiveHotel.id,
      mealTier: "premium",
      days: ctx.dates.map((_, i) => ({
        dayIndex: i,
        theme: `Day ${i + 1}`,
        placeIds: ctx.rankedPlaceIds.slice(i * 3, i * 3 + 3),
      })),
    };

    const itin = buildItinerary(expensiveDraft, ctx, meta);
    console.log(`[Udaipur Test c] Expensive draft total cost: ${formatMoney(itin.costs.grandTotalMinor, "USD")}`);
    const budgetViolation = itin.validation.violations.find(
      (v) => v.ruleId === "R1" && v.code === "BUDGET_EXCEEDED",
    );
    console.log(`[Udaipur Test c] R1 BUDGET_EXCEEDED violation found: ${budgetViolation?.message ?? "none"}`);

    expect(budgetViolation).toBeDefined();
    expect(budgetViolation?.severity).toBe("hard");
    expect(itin.validation.passed).toBe(false);
  });
});
