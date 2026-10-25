/**
 * Human-in-the-loop trade-off. Both options are fully computed and validated by code, so choosing one
 * needs no further LLM call and no server round trip.
 */
import type { TradeoffOption } from "../../types/travelverse.js";
import { buildItinerary, type BuildMeta } from "./build.js";
import { draftPlaceIds, type NormalizedDraft, type PlanningContext } from "./context.js";
import { ceilToMajor, formatMoney } from "./money.js";
import { repairToFit } from "./repair.js";

export function withBudget(ctx: PlanningContext, amountMinor: number): PlanningContext {
  return { ...ctx, request: { ...ctx.request, budget: { ...ctx.request.budget, amountMinor } } };
}

export function diffChanges(before: NormalizedDraft, after: NormalizedDraft, ctx: PlanningContext): string[] {
  const out: string[] = [];
  const name = (id: string) => ctx.places.get(id)?.name ?? id;
  if (before.lodgingId !== after.lodgingId) {
    const a = ctx.lodging.get(before.lodgingId);
    const b = ctx.lodging.get(after.lodgingId);
    out.push(`Stay: ${a?.name ?? before.lodgingId} (${a?.tier ?? "?"}) -> ${b?.name ?? after.lodgingId} (${b?.tier ?? "?"})`);
  }
  if (before.mealTier !== after.mealTier) out.push(`Meals: ${before.mealTier} -> ${after.mealTier}`);
  const dayOf = (d: NormalizedDraft) => new Map(d.days.flatMap((x) => x.placeIds.map((id) => [id, x.dayIndex] as const)));
  const b = dayOf(before);
  const a = dayOf(after);
  for (const id of draftPlaceIds(before)) if (!a.has(id)) out.push(`Skip: ${name(id)}`);
  for (const id of draftPlaceIds(after)) if (!b.has(id)) out.push(`Add: ${name(id)}`);
  for (const [id, day] of a) {
    const prev = b.get(id);
    if (prev !== undefined && prev !== day) out.push(`Move: ${name(id)} to Day ${day + 1}`);
  }
  return out.map((s) => s.slice(0, 200)).slice(0, 12);
}

export function buildTradeoffs(best: NormalizedDraft, ctx: PlanningContext, meta: BuildMeta): TradeoffOption[] {
  const budget = ctx.request.budget.amountMinor;
  const f = (n: number) => formatMoney(n, ctx.currency);
  const options: TradeoffOption[] = [];

  const a = repairToFit(best, ctx, { fixBudget: false, meta });
  const aOtherHard = a.itinerary.validation.violations.some((v) => v.severity === "hard" && v.ruleId !== "R1");
  const aTotal = a.itinerary.costs.grandTotalMinor;
  if (!aOtherHard && aTotal > budget) {
    const newBudget = ceilToMajor(aTotal, ctx.currency);
    options.push({
      id: "A",
      title: "Keep your choices, raise the budget",
      summary: `Raise the budget by ${f(newBudget - budget)} to keep the chosen stay, meals and stops (accessibility fixes still applied).`,
      deltaBudgetMinor: newBudget - budget,
      changes: [`Budget: ${f(budget)} -> ${f(newBudget)}`, ...diffChanges(best, a.draft, ctx)].slice(0, 12),
      itinerary: buildItinerary(a.draft, withBudget(ctx, newBudget), meta),
    });
  }

  const b = repairToFit(best, ctx, { fixBudget: true, meta });
  const bChanges = diffChanges(best, b.draft, ctx);
  if (b.itinerary.validation.passed) {
    options.push({
      id: "B",
      title: `Stay within ${f(budget)}`,
      summary: `Keep the budget with ${bChanges.length} change(s) to the plan.`,
      deltaBudgetMinor: 0,
      changes: bChanges,
      itinerary: b.itinerary,
    });
  } else if (!b.itinerary.validation.violations.some((v) => v.severity === "hard" && v.ruleId !== "R1")) {
    const need = ceilToMajor(b.itinerary.costs.grandTotalMinor, ctx.currency);
    options.push({
      id: "B",
      title: "Leanest possible plan",
      summary: `Even the leanest plan needs ${f(need)} (${f(need - budget)} more than the budget).`,
      deltaBudgetMinor: need - budget,
      changes: [`Budget: ${f(budget)} -> ${f(need)}`, ...bChanges].slice(0, 12),
      itinerary: buildItinerary(b.draft, withBudget(ctx, need), meta),
    });
  }

  if (options.length === 0) {
    options.push({
      id: "B",
      title: "Best effort plan",
      summary: "Some hard rules could not be satisfied automatically. Review the flagged stops.",
      deltaBudgetMinor: 0,
      changes: bChanges,
      itinerary: b.itinerary,
    });
  }
  return options;
}
