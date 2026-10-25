/** Planner (Super, Ultra on the last re-plan) and Critic (Super). Both only choose ids; code computes and enforces. */
import {
  CriticFeedback as CriticFeedbackSchema,
  PlannerDraft,
  type BudgetStrategy,
  type Directive,
  type FinalItinerary,
  type ModelRole,
  type Tier,
} from "../../types/travelverse.js";
import type { BuildMeta } from "../engine/build.js";
import { draftPlaceIds, rankOf, type NormalizedDraft, type PlanningContext } from "../engine/context.js";
import { convertMinor, formatMoney, mulMinor } from "../engine/money.js";
import { lodgingStayMinor, normalizeDraft, normalizeId } from "../engine/normalize.js";
import { TIER_ORDER } from "../engine/profiles.js";
import { applyDirectives, fallbackDirectives, greedyDraft, placeCostMinor, repairToFit } from "../engine/repair.js";
import { hoursLabel, minToHhmm, weekdayName } from "../engine/time.js";
import { CRITIC_SYSTEM, PLANNER_SYSTEM } from "../llm/prompts.js";
import { sanitizeExternalText } from "../security/untrusted.js";
import { llmJson, short, type AgentRun } from "./common.js";

function mealTotalMinor(ctx: PlanningContext, tier: Tier, days = ctx.dates.length): number {
  const m = ctx.meals[tier];
  return convertMinor(mulMinor(mulMinor(m.amountMinor, ctx.request.travelers), days), m.currency, ctx.currency, ctx.fx);
}

function arrivalMinor(ctx: PlanningContext): number {
  if (!ctx.arrival) return 0;
  return convertMinor(mulMinor(ctx.arrival.amountMinor, ctx.request.travelers), ctx.arrival.currency, ctx.currency, ctx.fx);
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function plannerBrief(
  ctx: PlanningContext,
  o: { directives: readonly Directive[]; mustFix: readonly string[]; previous: NormalizedDraft | null; strategy: BudgetStrategy },
): string {
  const f = (n: number) => formatMoney(n, ctx.currency);
  const req = ctx.request;
  const places = ctx.rankedPlaceIds.slice(0, 30).flatMap((id, i) => {
    const p = ctx.places.get(id);
    if (!p) return [];
    const adv = ctx.advisories
      .filter((a) => a.affectsPlaceIds.includes(id))
      .map((a) => `${a.kind} (unverified web report): ${short(a.title, 80)}`)
      .join("; ");
    return [
      {
        id,
        name: p.name,
        category: p.category,
        minutes: p.visitMin,
        cost: `${f(placeCostMinor(ctx, id))} for the party`,
        costIsEstimate: p.ticketPerPerson === null,
        stepFree: p.stepFree,
        hours: hoursLabel(p.hours),
        outdoor: p.outdoor,
        moodRank: i + 1,
        loc: [r3(p.location.lat), r3(p.location.lon)],
        ...(adv ? { advisory: adv } : {}),
      },
    ];
  });
  const brief = {
    trip: {
      destination: ctx.destinationName,
      days: ctx.dates.length,
      dates: ctx.dates.map((date, i) => {
        const w = ctx.weather.get(date);
        return { dayIndex: i, date, weekday: weekdayName(date), weather: w ? `${w.label}, rain ${w.rainProbPct ?? "?"}%, max ${w.tMaxC ?? "?"}C` : "unknown" };
      }),
      travelers: req.travelers,
      pace: req.pace,
      mood: req.mood,
      stepFreeRequired: req.accessibility.stepFreeRequired,
      maxWalkKmPerDay: req.accessibility.maxWalkKmPerDay,
    },
    budget: `${f(req.budget.amountMinor)} for everything (stay, meals, tickets, taxis${ctx.arrival ? ", getting there" : ""})`,
    fixedCosts: ctx.arrival ? { gettingThere: f(arrivalMinor(ctx)) } : {},
    limits: {
      maxStopsPerDay: ctx.profile.maxVisits,
      dayStart: minToHhmm(ctx.profile.dayStartMin),
      backBy: minToHhmm(ctx.profile.dayEndMin),
      maxTransitMinPerDay: ctx.profile.maxTransitMin,
    },
    strategy: { lodgingTier: o.strategy.lodgingTier, mealTier: o.strategy.mealTier, note: o.strategy.rationale },
    lodging: [...ctx.lodging.values()].map((l) => ({ id: l.id, name: l.name, tier: l.tier, stayTotal: f(lodgingStayMinor(l.id, ctx)), stepFree: l.stepFree })),
    meals: Object.fromEntries(TIER_ORDER.map((t) => [t, `${f(mealTotalMinor(ctx, t, 1))} per day for the party`])),
    places,
    ...(o.mustFix.length > 0 ? { mustFix: o.mustFix } : {}),
    ...(o.directives.length > 0 ? { directives: o.directives } : {}),
    ...(o.previous ? { previousPlan: { lodgingId: o.previous.lodgingId, mealTier: o.previous.mealTier, days: o.previous.days.map((d) => d.placeIds) } } : {}),
  };
  return JSON.stringify(brief);
}

export interface PlannerOutcome {
  draft: NormalizedDraft;
  unknownIds: string[];
  duplicates: string[];
  lodgingReplaced: boolean;
  model: string;
  fallback: boolean;
  rationale: string;
}

export async function runPlanner(
  run: AgentRun,
  ctx: PlanningContext,
  o: { round: number; role: Extract<ModelRole, "planner" | "escalation">; directives: readonly Directive[]; mustFix: readonly string[]; previous: NormalizedDraft | null; strategy: BudgetStrategy },
): Promise<PlannerOutcome> {
  const out = await llmJson(run, {
    agent: "planner",
    role: o.role,
    system: PLANNER_SYSTEM,
    user: plannerBrief(ctx, o),
    schema: PlannerDraft,
    schemaName: "PlannerDraft",
  });
  if (out) {
    const n = normalizeDraft(out.data, ctx);
    return {
      draft: n.draft,
      unknownIds: n.unknownIds,
      duplicates: n.duplicates,
      lodgingReplaced: n.lodgingReplaced,
      model: out.meta.model,
      fallback: false,
      rationale: sanitizeExternalText(out.data.rationale, 400),
    };
  }
  const meta: BuildMeta = { round: o.round, mode: "live", model: "rules-engine", deterministicFallback: true };
  const start = o.previous ? applyDirectives(o.previous, o.directives, ctx).draft : greedyDraft(ctx, { lodgingTier: o.strategy.lodgingTier, mealTier: o.strategy.mealTier });
  const repaired = repairToFit(start, ctx, { fixBudget: true, meta });
  run.emit({ type: "thinking", agent: "planner", text: "Model unavailable; built the plan with the deterministic planner instead." });
  return { draft: repaired.draft, unknownIds: [], duplicates: [], lodgingReplaced: false, model: "rules-engine", fallback: true, rationale: "" };
}

export function criticBrief(ctx: PlanningContext, itin: FinalItinerary, draft: NormalizedDraft): string {
  const f = (n: number) => formatMoney(n, ctx.currency);
  const over = itin.costs.grandTotalMinor - itin.costs.budgetMinor;
  const currentStay = lodgingStayMinor(draft.lodgingId, ctx);
  const currentMeals = mealTotalMinor(ctx, draft.mealTier);
  const used = new Set(draftPlaceIds(draft));
  const view = (id: string) => {
    const p = ctx.places.get(id);
    return p
      ? { id, name: p.name, category: p.category, cost: f(placeCostMinor(ctx, id)), stepFree: p.stepFree, hours: hoursLabel(p.hours), moodRank: rankOf(ctx, id) + 1 }
      : { id, name: "unknown" };
  };
  const lodging = ctx.lodging.get(draft.lodgingId);
  return JSON.stringify({
    trip: {
      days: ctx.dates.length,
      dates: ctx.dates.map((d, i) => ({ dayIndex: i, date: d, weekday: weekdayName(d) })),
      travelers: ctx.request.travelers,
      pace: ctx.request.pace,
      stepFreeRequired: ctx.request.accessibility.stepFreeRequired,
      maxWalkKmPerDay: ctx.request.accessibility.maxWalkKmPerDay,
    },
    budget: f(itin.costs.budgetMinor),
    total: f(itin.costs.grandTotalMinor),
    overspend: over > 0 ? f(over) : null,
    violations: itin.validation.violations.slice(0, 20).map((v) => ({ rule: v.ruleId, severity: v.severity, code: v.code, message: v.message, day: v.dayIndex, ids: v.itemIds })),
    draft: {
      lodging: lodging ? { id: lodging.id, name: lodging.name, tier: lodging.tier, stayTotal: f(currentStay), stepFree: lodging.stepFree } : null,
      mealTier: draft.mealTier,
      mealsTotal: f(currentMeals),
      days: draft.days.map((d) => ({ dayIndex: d.dayIndex, places: d.placeIds.map(view) })),
    },
    alternatives: ctx.rankedPlaceIds.filter((id) => !used.has(id)).slice(0, 15).map(view),
    lodging: [...ctx.lodging.values()].map((l) => {
      const stay = lodgingStayMinor(l.id, ctx);
      return { id: l.id, name: l.name, tier: l.tier, stayTotal: f(stay), saves: f(Math.max(0, currentStay - stay)), stepFree: l.stepFree };
    }),
    mealTiers: TIER_ORDER.map((t) => ({ tier: t, total: f(mealTotalMinor(ctx, t)), saves: f(Math.max(0, currentMeals - mealTotalMinor(ctx, t))) })),
  });
}

/** Keeps only directives whose ids exist; returns them with normalized ids. */
export function filterDirectives(ds: readonly Directive[], ctx: PlanningContext): Directive[] {
  const placeOk = (id: string) => ctx.places.has(normalizeId(id));
  const out: Directive[] = [];
  for (const d of ds) {
    switch (d.op) {
      case "drop_place":
        if (placeOk(d.placeId)) out.push({ ...d, placeId: normalizeId(d.placeId) });
        break;
      case "swap_place":
        if (placeOk(d.placeId) && placeOk(d.replacementId)) out.push({ ...d, placeId: normalizeId(d.placeId), replacementId: normalizeId(d.replacementId) });
        break;
      case "move_place":
        if (placeOk(d.placeId) && d.toDayIndex < ctx.dates.length) out.push({ ...d, placeId: normalizeId(d.placeId) });
        break;
      case "change_lodging":
        if (ctx.lodging.has(normalizeId(d.lodgingId))) out.push({ ...d, lodgingId: normalizeId(d.lodgingId) });
        break;
      case "change_meal_tier":
        out.push(d);
        break;
    }
  }
  return out.map((d) => ({ ...d, reason: sanitizeExternalText(d.reason, 200) }));
}

export async function runCritic(
  run: AgentRun,
  ctx: PlanningContext,
  itin: FinalItinerary,
  draft: NormalizedDraft,
): Promise<{ summary: string; directives: Directive[]; fallback: boolean }> {
  const out = await llmJson(run, {
    agent: "critic",
    role: "planner",
    system: CRITIC_SYSTEM,
    user: criticBrief(ctx, itin, draft),
    schema: CriticFeedbackSchema,
    schemaName: "CriticFeedback",
    temperature: 0.3,
  });
  if (out) {
    const valid = filterDirectives(out.data.directives, ctx);
    const dropped = out.data.directives.length - valid.length;
    if (dropped > 0) run.emit({ type: "thinking", agent: "critic", text: `Ignored ${dropped} directive(s) that referenced unknown ids.` });
    if (valid.length > 0) return { summary: sanitizeExternalText(out.data.summary, 400), directives: valid, fallback: false };
  }
  const directives = fallbackDirectives(itin, draft, ctx);
  return {
    summary: `Rule-based critic proposed ${directives.length} fix(es) for ${itin.validation.hardCount} hard issue(s).`,
    directives,
    fallback: true,
  };
}
