/**
 * Deterministic plan surgery:
 *  - applyDirectives: enforce Critic directives (unknown ids rejected, never trusted blindly)
 *  - fallbackDirectives: rule-based Critic used when the LLM Critic fails
 *  - repairToFit: greedy loop that fixes hard violations (used for trade-off options)
 *  - greedyDraft: complete rule-based planner used when every LLM is unavailable
 */
import type { Directive, FinalItinerary, RuleId, Tier, Violation } from "../../types/travelverse.js";
import { buildItinerary, type BuildMeta } from "./build.js";
import { cloneDraft, draftPlaceIds, rankOf, type NormalizedDraft, type PlanningContext } from "./context.js";
import { convertMinor, mulMinor } from "./money.js";
import { cheapestAcceptableLodging, lodgingStayMinor, normalizeId } from "./normalize.js";
import { ON_SITE_WALK_KM, TIER_ORDER } from "./profiles.js";
import { ticketOriginal } from "./schedule.js";
import { haversineKm, openWindow } from "./time.js";

export interface DirectiveResult {
  draft: NormalizedDraft;
  applied: Directive[];
  rejected: Array<{ directive: Directive; reason: string }>;
}

function locate(d: NormalizedDraft, id: string): { day: number; index: number } | null {
  for (const day of d.days) {
    const index = day.placeIds.indexOf(id);
    if (index >= 0) return { day: day.dayIndex, index };
  }
  return null;
}

function isAcceptable(ctx: PlanningContext, placeId: string): boolean {
  const p = ctx.places.get(placeId);
  if (!p) return false;
  return !(ctx.request.accessibility.stepFreeRequired && p.stepFree === "not_step_free");
}

/** Open that day AND the visit can finish before the pace's day end (unknown hours are allowed). */
function isOpenOn(ctx: PlanningContext, placeId: string, dayIndex: number): boolean {
  const p = ctx.places.get(placeId);
  const date = ctx.dates[dayIndex];
  if (!p || date === undefined) return false;
  const w = openWindow(p.hours, date);
  if (w === "closed") return false;
  if (w === "unknown") return true;
  return Math.max(w.openMin, ctx.profile.dayStartMin) + p.visitMin <= Math.min(w.closeMin, ctx.profile.dayEndMin);
}

export function placeCostMinor(ctx: PlanningContext, placeId: string): number {
  const p = ctx.places.get(placeId);
  if (!p) return 0;
  const t = ticketOriginal(p, ctx);
  return convertMinor(t.amountMinor, t.currency, ctx.currency, ctx.fx);
}

function mealCostMinor(ctx: PlanningContext, tier: Tier): number {
  const m = ctx.meals[tier];
  return convertMinor(mulMinor(mulMinor(m.amountMinor, ctx.request.travelers), ctx.dates.length), m.currency, ctx.currency, ctx.fx);
}

export function applyDirectives(input: NormalizedDraft, directives: readonly Directive[], ctx: PlanningContext): DirectiveResult {
  const draft = cloneDraft(input);
  const applied: Directive[] = [];
  const rejected: DirectiveResult["rejected"] = [];
  const reject = (directive: Directive, reason: string) => rejected.push({ directive, reason });
  for (const d of directives) {
    switch (d.op) {
      case "drop_place": {
        const id = normalizeId(d.placeId);
        const at = locate(draft, id);
        if (!at) break; // already absent: satisfied
        draft.days[at.day]?.placeIds.splice(at.index, 1);
        applied.push(d);
        break;
      }
      case "swap_place": {
        const id = normalizeId(d.placeId);
        const rep = normalizeId(d.replacementId);
        const at = locate(draft, id);
        if (!ctx.places.has(rep)) {
          reject(d, "unknown replacement id");
          break;
        }
        if (!isAcceptable(ctx, rep)) {
          reject(d, "replacement violates step-free requirement");
          break;
        }
        if (locate(draft, rep)) {
          if (at) draft.days[at.day]?.placeIds.splice(at.index, 1);
          if (at) applied.push(d);
          break;
        }
        if (!at) break; // original absent: satisfied
        const day = draft.days[at.day];
        if (day) day.placeIds[at.index] = rep;
        applied.push(d);
        break;
      }
      case "change_lodging": {
        const id = normalizeId(d.lodgingId);
        const l = ctx.lodging.get(id);
        if (!l) {
          reject(d, "unknown lodging id");
          break;
        }
        if (ctx.request.accessibility.stepFreeRequired && l.stepFree === "not_step_free") {
          reject(d, "lodging is not step-free");
          break;
        }
        if (draft.lodgingId !== id) {
          draft.lodgingId = id;
          applied.push(d);
        }
        break;
      }
      case "change_meal_tier": {
        if (draft.mealTier !== d.mealTier) {
          draft.mealTier = d.mealTier;
          applied.push(d);
        }
        break;
      }
      case "move_place": {
        const id = normalizeId(d.placeId);
        const at = locate(draft, id);
        const target = draft.days[d.toDayIndex];
        if (!at) {
          reject(d, "place not in plan");
          break;
        }
        if (!target) {
          reject(d, "target day outside the trip");
          break;
        }
        if (at.day === d.toDayIndex) break;
        draft.days[at.day]?.placeIds.splice(at.index, 1);
        target.placeIds.push(id);
        applied.push(d);
        break;
      }
    }
  }
  return { draft, applied, rejected };
}

function directiveKeys(d: Directive): string[] {
  switch (d.op) {
    case "drop_place":
    case "move_place":
      return [`p:${normalizeId(d.placeId)}`];
    case "swap_place":
      return [`p:${normalizeId(d.placeId)}`, `p:${normalizeId(d.replacementId)}`];
    case "change_lodging":
      return ["lodging"];
    case "change_meal_tier":
      return ["meal"];
  }
}

/** Newer directives override older ones that touch the same place, the lodging or the meal tier. */
export function mergeDirectives(old: readonly Directive[], incoming: readonly Directive[], cap = 12): Directive[] {
  const keys = new Set(incoming.flatMap(directiveKeys));
  const kept = old.filter((d) => !directiveKeys(d).some((k) => keys.has(k)));
  return [...kept, ...incoming].slice(-cap);
}

const PRIORITY: readonly RuleId[] = ["R6", "R2", "R7", "R4", "R3", "R1", "R0", "R5", "R8"];
const byPriority = (a: Violation, b: Violation) => PRIORITY.indexOf(a.ruleId) - PRIORITY.indexOf(b.ruleId);

const mk = {
  drop: (placeId: string, rule: RuleId, reason: string): Directive => ({ op: "drop_place", placeId, reason, addresses: [rule] }),
  swap: (placeId: string, replacementId: string, rule: RuleId, reason: string): Directive => ({ op: "swap_place", placeId, replacementId, reason, addresses: [rule] }),
  move: (placeId: string, toDayIndex: number, rule: RuleId, reason: string): Directive => ({ op: "move_place", placeId, toDayIndex, reason, addresses: [rule] }),
  lodging: (lodgingId: string, rule: RuleId, reason: string): Directive => ({ op: "change_lodging", lodgingId, reason, addresses: [rule] }),
  meal: (mealTier: Tier, rule: RuleId, reason: string): Directive => ({ op: "change_meal_tier", mealTier, reason, addresses: [rule] }),
};

/** Best unused, acceptable place open on that day; same category preferred, then mood rank. */
function bestReplacement(draft: NormalizedDraft, ctx: PlanningContext, forId: string, dayIndex: number, requireStepFree: boolean): string | null {
  const used = new Set(draftPlaceIds(draft));
  const cat = ctx.places.get(forId)?.category;
  const pool = ctx.rankedPlaceIds.filter((id) => {
    const p = ctx.places.get(id);
    if (!p || used.has(id) || !isAcceptable(ctx, id) || !isOpenOn(ctx, id, dayIndex)) return false;
    return !requireStepFree || p.stepFree === "step_free";
  });
  const sameCat = pool.find((id) => ctx.places.get(id)?.category === cat);
  return sameCat ?? pool[0] ?? null;
}

function dayWithRoom(draft: NormalizedDraft, ctx: PlanningContext, placeId: string, excludeDay: number): number | null {
  const options = draft.days
    .filter((d) => d.dayIndex !== excludeDay && d.placeIds.length < ctx.profile.maxVisits && isOpenOn(ctx, placeId, d.dayIndex))
    .sort((a, b) => a.placeIds.length - b.placeIds.length);
  return options[0]?.dayIndex ?? null;
}

function budgetDirectives(draft: NormalizedDraft, itin: FinalItinerary, ctx: PlanningContext): Directive[] {
  const over = itin.costs.grandTotalMinor - itin.costs.budgetMinor;
  if (over <= 0) return [];
  const out: Directive[] = [];
  let savings = 0;
  const currentStay = lodgingStayMinor(draft.lodgingId, ctx);
  const cheaper = [...ctx.lodging.values()]
    .filter((l) => !(ctx.request.accessibility.stepFreeRequired && l.stepFree === "not_step_free"))
    .map((l) => ({ id: l.id, stay: lodgingStayMinor(l.id, ctx) }))
    .filter((l) => l.stay < currentStay)
    .sort((a, b) => b.stay - a.stay);
  const pick = cheaper.find((l) => currentStay - l.stay >= over) ?? cheaper.at(-1);
  if (pick) {
    out.push(mk.lodging(pick.id, "R1", "Cheaper stay to fit the budget"));
    savings += currentStay - pick.stay;
  }
  let tierIdx = TIER_ORDER.indexOf(draft.mealTier);
  let tier = draft.mealTier;
  while (savings < over && tierIdx > 0) {
    const next = TIER_ORDER[tierIdx - 1];
    if (!next) break;
    savings += mealCostMinor(ctx, tier) - mealCostMinor(ctx, next);
    tier = next;
    tierIdx -= 1;
  }
  if (tier !== draft.mealTier) out.push(mk.meal(tier, "R1", "Simpler meals to fit the budget"));
  if (savings < over) {
    const paid = draftPlaceIds(draft)
      .map((id) => ({ id, cost: placeCostMinor(ctx, id), rank: rankOf(ctx, id) }))
      .filter((p) => p.cost > 0)
      .sort((a, b) => b.rank - a.rank || b.cost - a.cost);
    for (const p of paid) {
      if (savings >= over) break;
      out.push(mk.drop(p.id, "R1", "Lower-priority paid stop dropped to fit the budget"));
      savings += p.cost;
    }
  }
  return out;
}

export function directivesFor(v: Violation, draft: NormalizedDraft, itin: FinalItinerary, ctx: PlanningContext): Directive[] {
  const placeId = v.itemIds[0];
  const day = v.dayIndex;
  switch (v.code) {
    case "NOT_STEP_FREE": {
      if (!placeId || day === null) return [];
      const rep = bestReplacement(draft, ctx, placeId, day, true);
      return [rep ? mk.swap(placeId, rep, "R6", "Step-free alternative") : mk.drop(placeId, "R6", "Not step-free")];
    }
    case "NOT_STEP_FREE_LODGING": {
      const options = [...ctx.lodging.values()].filter((l) => l.stepFree === "step_free");
      const pool = options.length > 0 ? options : [...ctx.lodging.values()].filter((l) => l.stepFree !== "not_step_free");
      const best = pool.sort((a, b) => lodgingStayMinor(a.id, ctx) - lodgingStayMinor(b.id, ctx))[0];
      return best ? [mk.lodging(best.id, "R6", "Step-free hotel")] : [];
    }
    case "CLOSED_ON_DATE":
    case "BEFORE_OPENING":
    case "CLOSES_BEFORE_END": {
      if (!placeId || day === null) return [];
      const to = dayWithRoom(draft, ctx, placeId, day);
      if (to !== null) return [mk.move(placeId, to, "R2", "Move to a day when it is open")];
      const rep = bestReplacement(draft, ctx, placeId, day, false);
      return [rep ? mk.swap(placeId, rep, "R2", "Open alternative") : mk.drop(placeId, "R2", "Closed during the trip")];
    }
    case "TOO_MANY_STOPS":
    case "DAY_TOO_LONG": {
      if (day === null) return [];
      const ids = draft.days[day]?.placeIds ?? [];
      const worst = [...ids].sort((a, b) => rankOf(ctx, b) - rankOf(ctx, a))[0];
      if (!worst) return [];
      const to = dayWithRoom(draft, ctx, worst, day);
      return [to !== null ? mk.move(worst, to, "R7", "Spread the load") : mk.drop(worst, "R7", "Too much for one day")];
    }
    case "TRANSIT_TOO_LONG": {
      if (day === null) return [];
      const lodging = ctx.lodging.get(draft.lodgingId);
      const ids = draft.days[day]?.placeIds ?? [];
      if (!lodging) return [];
      const far = [...ids].sort((a, b) => {
        const pa = ctx.places.get(a);
        const pb = ctx.places.get(b);
        return (pb ? haversineKm(lodging.location, pb.location) : 0) - (pa ? haversineKm(lodging.location, pa.location) : 0);
      })[0];
      return far ? [mk.drop(far, "R4", "Too far for this day")] : [];
    }
    case "WALK_LIMIT": {
      if (day === null) return [];
      const ids = draft.days[day]?.placeIds ?? [];
      const walk = (id: string) => {
        const p = ctx.places.get(id);
        return p ? (p.onSiteWalkKm ?? ON_SITE_WALK_KM[p.category]) : 0;
      };
      const heavy = [...ids].sort((a, b) => walk(b) - walk(a))[0];
      return heavy ? [mk.drop(heavy, "R3", "Too much walking")] : [];
    }
    case "BUDGET_EXCEEDED":
      return budgetDirectives(draft, itin, ctx);
    default:
      return [];
  }
}

/** Rule-based Critic: directives for the hard violations, simulated in order so they never conflict. */
export function fallbackDirectives(itin: FinalItinerary, draft: NormalizedDraft, ctx: PlanningContext, max = 6): Directive[] {
  const out: Directive[] = [];
  let work = cloneDraft(draft);
  const hard = itin.validation.violations.filter((v) => v.severity === "hard").sort(byPriority);
  for (const v of hard) {
    if (out.length >= max) break;
    const res = applyDirectives(work, directivesFor(v, work, itin, ctx), ctx);
    work = res.draft;
    out.push(...res.applied);
  }
  return out.slice(0, max);
}

/** Greedy repair loop. fixBudget=false keeps the experience and leaves R1 for the human to decide. */
export function repairToFit(
  draft: NormalizedDraft,
  ctx: PlanningContext,
  opts: { fixBudget: boolean; meta: BuildMeta },
): { draft: NormalizedDraft; itinerary: FinalItinerary } {
  let current = cloneDraft(draft);
  const moved = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const itin = buildItinerary(current, ctx, opts.meta);
    const hard = itin.validation.violations
      .filter((v) => v.severity === "hard" && (opts.fixBudget || v.ruleId !== "R1"))
      .sort(byPriority);
    if (hard.length === 0) return { draft: current, itinerary: itin };
    let changed = false;
    for (const v of hard) {
      const ds = directivesFor(v, current, itin, ctx).map((d) =>
        d.op === "move_place" && moved.has(normalizeId(d.placeId)) ? mk.drop(d.placeId, d.addresses[0] ?? "R7", "Could not be rescheduled") : d,
      );
      const res = applyDirectives(current, ds, ctx);
      if (res.applied.length > 0) {
        for (const d of res.applied) if (d.op === "move_place") moved.add(normalizeId(d.placeId));
        current = res.draft;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return { draft: current, itinerary: buildItinerary(current, ctx, opts.meta) };
}

function orderByProximity(ids: readonly string[], start: { lat: number; lon: number }, ctx: PlanningContext): string[] {
  const left = [...ids];
  const out: string[] = [];
  let at = start;
  while (left.length > 0) {
    let bestI = 0;
    let bestD = Infinity;
    left.forEach((id, i) => {
      const p = ctx.places.get(id);
      const dist = p ? haversineKm(at, p.location) : Infinity;
      if (dist < bestD) {
        bestD = dist;
        bestI = i;
      }
    });
    const [id] = left.splice(bestI, 1);
    if (id === undefined) break;
    out.push(id);
    at = ctx.places.get(id)?.location ?? at;
  }
  return out;
}

const CATEGORY_THEME: Readonly<Record<string, string>> = {
  heritage: "Palaces and heritage",
  museum: "Museums and art",
  viewpoint: "Views and sunsets",
  garden: "Gardens and calm",
  market: "Markets and crafts",
  religious: "Temples and traditions",
  waterfront: "Lakes and waterfronts",
  nature: "Nature escape",
  experience: "Experiences",
  show: "Culture and shows",
};

/** Complete rule-based planner (no LLM). Always followed by repairToFit. */
export function greedyDraft(ctx: PlanningContext, prefs: { lodgingTier: Tier; mealTier: Tier }): NormalizedDraft {
  const acceptableLodging = [...ctx.lodging.values()].filter(
    (l) => !(ctx.request.accessibility.stepFreeRequired && l.stepFree === "not_step_free"),
  );
  const inTier = acceptableLodging
    .filter((l) => l.tier === prefs.lodgingTier)
    .sort((a, b) => lodgingStayMinor(a.id, ctx) - lodgingStayMinor(b.id, ctx));
  const lodgingId = inTier[0]?.id ?? cheapestAcceptableLodging(ctx);
  const lodging = ctx.lodging.get(lodgingId);
  const days: NormalizedDraft["days"] = ctx.dates.map((_, i) => ({ dayIndex: i, theme: `Day ${i + 1}`, placeIds: [] }));
  const cap = ctx.dates.length * ctx.profile.maxVisits;
  let placed = 0;
  for (const id of ctx.rankedPlaceIds) {
    if (placed >= cap) break;
    if (!isAcceptable(ctx, id)) continue;
    const target = days
      .filter((d) => d.placeIds.length < ctx.profile.maxVisits && isOpenOn(ctx, id, d.dayIndex))
      .sort((a, b) => a.placeIds.length - b.placeIds.length)[0];
    if (!target) continue;
    target.placeIds.push(id);
    placed += 1;
  }
  for (const d of days) {
    if (lodging) d.placeIds = orderByProximity(d.placeIds, lodging.location, ctx);
    const first = d.placeIds[0] ? ctx.places.get(d.placeIds[0]) : undefined;
    if (first) d.theme = CATEGORY_THEME[first.category] ?? d.theme;
  }
  return { lodgingId, mealTier: prefs.mealTier, days };
}

/** Lowest possible spend (cheapest acceptable stay + cheapest meals + arrival). Used to detect impossible budgets early. */
export function minimumFeasibleCostMinor(ctx: PlanningContext): number {
  const stay = lodgingStayMinor(cheapestAcceptableLodging(ctx), ctx);
  const meals = Math.min(...TIER_ORDER.map((t) => mealCostMinor(ctx, t)));
  const arrival = ctx.arrival
    ? convertMinor(mulMinor(ctx.arrival.amountMinor, ctx.request.travelers), ctx.arrival.currency, ctx.currency, ctx.fx)
    : 0;
  return stay + meals + arrival;
}
