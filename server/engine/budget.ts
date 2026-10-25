/** Deterministic cost roll-up. Every line keeps provenance; totals are integer sums in the budget currency. */
import type { CostBreakdown, CostCategory, CostLine, DayPlan, Lodging, PricedAmount, Tier } from "../../types/travelverse.js";
import type { PlanningContext } from "./context.js";
import { convertPriced, mulMinor, sumMinor } from "./money.js";
import { round2 } from "./time.js";

function withAmount(p: PricedAmount, amountMinor: number): PricedAmount {
  return { ...p, amountMinor };
}

export function computeCosts(days: readonly DayPlan[], lodging: Lodging, mealTier: Tier, ctx: PlanningContext): CostBreakdown {
  const lines: CostLine[] = [];
  const cur = ctx.currency;
  const travelers = ctx.request.travelers;

  if (ctx.nights > 0) {
    const original = withAmount(lodging.nightlyPerRoom, mulMinor(mulMinor(lodging.nightlyPerRoom.amountMinor, ctx.rooms), ctx.nights));
    lines.push({
      category: "lodging",
      label: `${lodging.name}: ${ctx.rooms} room(s) x ${ctx.nights} night(s)`.slice(0, 160),
      original,
      amount: convertPriced(original, cur, ctx.fx),
    });
  }

  const meal = ctx.meals[mealTier];
  const mealsOriginal = withAmount(meal, mulMinor(mulMinor(meal.amountMinor, travelers), ctx.dates.length));
  lines.push({
    category: "meals",
    label: `Meals (${mealTier}): ${travelers} traveler(s) x ${ctx.dates.length} day(s)`,
    original: mealsOriginal,
    amount: convertPriced(mealsOriginal, cur, ctx.fx),
  });

  const rides: Array<{ original: PricedAmount; amount: PricedAmount; km: number }> = [];
  for (const d of days) {
    for (const it of d.items) {
      if (it.kind === "visit" && it.cost.amountMinor > 0) {
        lines.push({ category: "tickets", label: `${it.name} (day ${d.dayIndex + 1})`.slice(0, 160), original: it.costOriginal, amount: it.cost });
      } else if (it.kind === "transit" && it.mode === "taxi") {
        rides.push({ original: it.costOriginal, amount: it.cost, km: it.distanceKm });
      }
    }
  }
  if (rides.length > 0) {
    const first = rides[0];
    if (first) {
      const km = round2(rides.reduce((s, r) => s + r.km, 0));
      lines.push({
        category: "local_transport",
        label: `Local taxis: ${rides.length} ride(s), ${km} km`,
        original: withAmount({ ...first.original, note: `Sum of ${rides.length} rides` }, sumMinor(rides.map((r) => r.original.amountMinor))),
        amount: withAmount({ ...first.amount, note: `Sum of ${rides.length} rides` }, sumMinor(rides.map((r) => r.amount.amountMinor))),
      });
    }
  }

  if (ctx.arrival) {
    const original = withAmount(ctx.arrival, mulMinor(ctx.arrival.amountMinor, travelers));
    lines.push({
      category: "arrival",
      label: `Getting there from ${ctx.request.origin} (round trip, ${travelers} traveler(s))`.slice(0, 160),
      original,
      amount: convertPriced(original, cur, ctx.fx),
    });
  }

  const cats: CostCategory[] = ["lodging", "meals", "tickets", "local_transport", "arrival"];
  const totalsMinor = Object.fromEntries(
    cats.map((c) => [c, sumMinor(lines.filter((l) => l.category === c).map((l) => l.amount.amountMinor))]),
  ) as Record<CostCategory, number>;
  const grand = sumMinor(lines.map((l) => l.amount.amountMinor));
  const estimate = sumMinor(lines.filter((l) => l.amount.provenance === "estimate").map((l) => l.amount.amountMinor));
  const converted = lines.some((l) => l.original.currency !== cur);

  return {
    currency: cur,
    lines: lines.slice(0, 80),
    totalsMinor,
    grandTotalMinor: grand,
    budgetMinor: ctx.request.budget.amountMinor,
    remainingMinor: ctx.request.budget.amountMinor - grand,
    estimateShareBps: grand === 0 ? 0 : Math.round((estimate * 10_000) / grand),
    fx: converted ? { asOf: ctx.fx.asOf, source: ctx.fx.source.slice(0, 120) } : null,
  };
}
