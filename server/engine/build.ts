/** NormalizedDraft -> fully computed, validated FinalItinerary (schedule + costs + rules + accessibility audit). */
import type { AccessibilityAudit, DayPlan, Evidence, FinalItinerary, Lodging, RunMode } from "../../types/travelverse.js";
import type { NormalizedDraft, PlanningContext } from "./context.js";
import { computeCosts } from "./budget.js";
import { validatePlan } from "./rules.js";
import { scheduleDay } from "./schedule.js";

export interface BuildMeta {
  round: number;
  mode: RunMode;
  model: string;
  deterministicFallback: boolean;
  unknownIds?: readonly string[];
  duplicates?: readonly string[];
  lodgingReplaced?: boolean;
}

function hasEvidence(list: readonly Evidence[] | undefined): boolean {
  return (list ?? []).some((e) => e.verbatimVerified || (e.method === "curated" && e.url !== undefined) || e.method === "osm_tag");
}

export function computeAudit(days: readonly DayPlan[], lodging: Lodging, ctx: PlanningContext): AccessibilityAudit {
  const required = ctx.request.accessibility.stepFreeRequired;
  const stops: Array<{ id: string; status: Lodging["stepFree"] }> = [{ id: lodging.id, status: lodging.stepFree }];
  for (const d of days) for (const it of d.items) if (it.kind === "visit") stops.push({ id: it.placeId, status: it.stepFree });
  const count = (s: Lodging["stepFree"]) => stops.filter((x) => x.status === s).length;
  const evidenced = stops.filter((s) => hasEvidence(ctx.evidence.get(s.id))).length;
  const sources = new Map<string, { domain: string; url: string; official: boolean }>();
  for (const s of stops) {
    for (const e of ctx.evidence.get(s.id) ?? []) {
      if (e.url && !sources.has(e.url)) sources.set(e.url, { domain: e.domain ?? new URL(e.url).hostname, url: e.url, official: e.official });
    }
  }
  const notStepFree = count("not_step_free");
  const unverified = count("unverified");
  let badge: AccessibilityAudit["badge"] = "not_required";
  if (required) {
    if (evidenced === stops.length && notStepFree === 0 && unverified === 0) badge = "verified";
    else if (evidenced > 0) badge = "partially_verified";
    else badge = "unverified";
  }
  return {
    required,
    stops: stops.length,
    stepFree: count("step_free"),
    partial: count("partial"),
    notStepFree,
    unverified,
    evidenced,
    sources: [...sources.values()].slice(0, 16),
    badge,
  };
}

export function buildItinerary(draft: NormalizedDraft, ctx: PlanningContext, meta: BuildMeta): FinalItinerary {
  const lodging = ctx.lodging.get(draft.lodgingId);
  if (!lodging) throw new Error(`Unknown lodging id after normalization: ${draft.lodgingId}`);
  const days = draft.days.map((d) => scheduleDay(d, lodging, ctx));
  const costs = computeCosts(days, lodging, draft.mealTier, ctx);
  const unknownIds = [...(meta.unknownIds ?? [])];
  const duplicates = [...(meta.duplicates ?? [])];
  const validation = validatePlan(
    { days, lodging, costs, unknownIds, duplicates, lodgingReplaced: meta.lodgingReplaced ?? false },
    ctx,
    meta.round,
  );
  return {
    runId: ctx.runId,
    round: meta.round,
    mode: meta.mode,
    request: ctx.request,
    destinationName: ctx.destinationName.slice(0, 80),
    lodging: {
      id: lodging.id,
      name: lodging.name,
      tier: lodging.tier,
      nights: ctx.nights,
      rooms: ctx.rooms,
      location: lodging.location,
      stepFree: lodging.stepFree,
      evidence: [...(ctx.evidence.get(lodging.id) ?? [])].slice(0, 3),
    },
    mealTier: draft.mealTier,
    days,
    costs,
    validation,
    audit: computeAudit(days, lodging, ctx),
    dropped: { unknownIds: unknownIds.slice(0, 30), duplicates: duplicates.slice(0, 30) },
    generatedBy: { model: meta.model.slice(0, 120), deterministicFallback: meta.deterministicFallback },
  };
}

/** Ranking used to keep the best attempt: fewer hard violations, then smaller overspend, then fewer soft ones. */
export function isBetter(a: FinalItinerary, b: FinalItinerary | null): boolean {
  if (!b) return true;
  if (a.validation.hardCount !== b.validation.hardCount) return a.validation.hardCount < b.validation.hardCount;
  const overA = Math.max(0, -a.costs.remainingMinor);
  const overB = Math.max(0, -b.costs.remainingMinor);
  if (overA !== overB) return overA < overB;
  return a.validation.softCount < b.validation.softCount;
}
