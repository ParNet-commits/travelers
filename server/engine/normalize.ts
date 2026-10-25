/** Turns an LLM PlannerDraft into a safe NormalizedDraft: unknown ids dropped, duplicates removed, day count fixed. */
import type { PlannerDraft } from "../../types/travelverse.js";
import type { NormalizedDraft, PlanningContext } from "./context.js";
import { convertMinor, mulMinor } from "./money.js";

export interface NormalizeResult {
  draft: NormalizedDraft;
  unknownIds: string[];
  duplicates: string[];
  lodgingReplaced: boolean;
}

const MAX_PLACES_PER_DAY = 8;

export function normalizeId(raw: string): string {
  return raw.trim().replace(/^["'`]+|["'`]+$/g, "").toLowerCase();
}

/** Total stay cost in the budget currency (used to compare lodging options). */
export function lodgingStayMinor(lodgingId: string, ctx: PlanningContext): number {
  const l = ctx.lodging.get(lodgingId);
  if (!l) return Number.MAX_SAFE_INTEGER;
  const orig = mulMinor(mulMinor(l.nightlyPerRoom.amountMinor, ctx.rooms), Math.max(ctx.nights, 0));
  return convertMinor(orig, l.nightlyPerRoom.currency, ctx.currency, ctx.fx);
}

/** Cheapest lodging that respects the step-free requirement (falls back to cheapest overall). */
export function cheapestAcceptableLodging(ctx: PlanningContext): string {
  const all = [...ctx.lodging.values()];
  const ok = ctx.request.accessibility.stepFreeRequired ? all.filter((l) => l.stepFree !== "not_step_free") : all;
  const pool = ok.length > 0 ? ok : all;
  const sorted = [...pool].sort((a, b) => lodgingStayMinor(a.id, ctx) - lodgingStayMinor(b.id, ctx));
  const first = sorted[0];
  if (!first) throw new Error("No lodging options in context");
  return first.id;
}

export function normalizeDraft(raw: PlannerDraft, ctx: PlanningContext): NormalizeResult {
  const unknownIds: string[] = [];
  const duplicates: string[] = [];

  let lodgingId = normalizeId(raw.lodgingId);
  let lodgingReplaced = false;
  if (!ctx.lodging.has(lodgingId)) {
    unknownIds.push(raw.lodgingId.slice(0, 80));
    lodgingId = cheapestAcceptableLodging(ctx);
    lodgingReplaced = true;
  }

  const days: NormalizedDraft["days"] = ctx.dates.map((_, i) => ({ dayIndex: i, theme: `Day ${i + 1}`, placeIds: [] }));
  const seen = new Set<string>();
  const themeSet = new Set<number>();
  for (const d of raw.days) {
    const target = days[d.dayIndex];
    if (!target) {
      d.placeIds.forEach((p) => unknownIds.push(`day${d.dayIndex}:${p}`.slice(0, 80)));
      continue;
    }
    const theme = d.theme.trim();
    if (theme && !themeSet.has(d.dayIndex)) {
      target.theme = theme.slice(0, 60);
      themeSet.add(d.dayIndex);
    }
    for (const rawId of d.placeIds) {
      const id = normalizeId(rawId);
      if (!ctx.places.has(id)) {
        unknownIds.push(rawId.slice(0, 80));
        continue;
      }
      if (seen.has(id)) {
        duplicates.push(id);
        continue;
      }
      if (target.placeIds.length >= MAX_PLACES_PER_DAY) continue;
      seen.add(id);
      target.placeIds.push(id);
    }
  }
  return {
    draft: { lodgingId, mealTier: raw.mealTier, days },
    unknownIds: unknownIds.slice(0, 30),
    duplicates: duplicates.slice(0, 30),
    lodgingReplaced,
  };
}
