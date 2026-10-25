/**
 * Deterministic rules engine (R0-R8). Pure function: same plan + context -> same report.
 * The Critic LLM never decides pass/fail; it only proposes fixes for what this file reports.
 */
import type {
  CostBreakdown,
  DayPlan,
  Lodging,
  RuleId,
  RuleOutcome,
  StepFreeStatus,
  ValidationReport,
  Violation,
} from "../../types/travelverse.js";
import type { PlanningContext } from "./context.js";
import { formatMoney } from "./money.js";
import { HEAT_SOFT_C, RAIN_SOFT_PCT, TIGHT_BUDGET_BPS } from "./profiles.js";
import { hhmmToMin, minToHhmm, openWindow, weekdayName } from "./time.js";

export interface RuleInput {
  days: readonly DayPlan[];
  lodging: Lodging;
  costs: CostBreakdown;
  unknownIds: readonly string[];
  duplicates: readonly string[];
  lodgingReplaced: boolean;
}

export const RULE_IDS: readonly RuleId[] = ["R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"];
export const RULE_TITLES: Readonly<Record<RuleId, string>> = {
  R0: "Data integrity",
  R1: "Budget",
  R2: "Opening hours",
  R3: "Walking",
  R4: "Transit time",
  R5: "Weather",
  R6: "Step-free access",
  R7: "Day length",
  R8: "Rest breaks",
};

interface RuleResult {
  violations: Violation[];
  applicable: boolean;
  note: string;
}
type RuleFn = (input: RuleInput, ctx: PlanningContext) => RuleResult;

function viol(
  ruleId: RuleId,
  severity: "hard" | "soft",
  code: string,
  message: string,
  extra: { dayIndex?: number; itemIds?: readonly string[]; measured?: number; limit?: number; unit?: string } = {},
): Violation {
  return {
    ruleId,
    severity,
    code,
    message: message.slice(0, 300),
    dayIndex: extra.dayIndex ?? null,
    itemIds: [...(extra.itemIds ?? [])].slice(0, 10),
    measured: extra.measured ?? null,
    limit: extra.limit ?? null,
    unit: extra.unit ?? null,
  };
}

const short = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}...` : s);
const dayN = (i: number) => `Day ${i + 1}`;

const r0: RuleFn = (inp) => {
  const out: Violation[] = [];
  const totalVisits = inp.days.reduce((s, d) => s + d.metrics.visits, 0);
  if (totalVisits === 0) out.push(viol("R0", "hard", "NO_ACTIVITIES", "The plan has no activities."));
  if (inp.unknownIds.length > 0) {
    out.push(viol("R0", "soft", "UNKNOWN_IDS_DROPPED", `${inp.unknownIds.length} unknown id(s) from the planner were ignored.`, { itemIds: inp.unknownIds }));
  }
  if (inp.duplicates.length > 0) {
    out.push(viol("R0", "soft", "DUPLICATES_DROPPED", `${inp.duplicates.length} duplicate stop(s) were removed.`, { itemIds: inp.duplicates }));
  }
  if (inp.lodgingReplaced) {
    out.push(viol("R0", "soft", "LODGING_REPLACED", "The planner chose an unknown hotel; the cheapest suitable option was used.", { itemIds: [inp.lodging.id] }));
  }
  if (totalVisits > 0) {
    for (const d of inp.days) {
      if (d.metrics.visits === 0) out.push(viol("R0", "soft", "EMPTY_DAY", `${dayN(d.dayIndex)} has no activities (free day).`, { dayIndex: d.dayIndex }));
    }
  }
  if (inp.costs.estimateShareBps > 5000) {
    out.push(viol("R0", "soft", "MOSTLY_ESTIMATES", `${Math.round(inp.costs.estimateShareBps / 100)}% of the total is estimated, not verified.`, { measured: inp.costs.estimateShareBps, limit: 5000, unit: "bps" }));
  }
  return { violations: out, applicable: true, note: "All ids known, no duplicates" };
};

const r1: RuleFn = (inp) => {
  const { grandTotalMinor: total, budgetMinor: budget, currency } = inp.costs;
  const f = (n: number) => formatMoney(n, currency);
  if (total > budget) {
    return {
      violations: [viol("R1", "hard", "BUDGET_EXCEEDED", `Total ${f(total)} exceeds the budget ${f(budget)} by ${f(total - budget)}.`, { measured: total, limit: budget, unit: currency })],
      applicable: true,
      note: "",
    };
  }
  const left = budget - total;
  const out: Violation[] = [];
  if (left * 10_000 < budget * TIGHT_BUDGET_BPS) {
    out.push(viol("R1", "soft", "BUDGET_TIGHT", `Only ${f(left)} left of ${f(budget)}.`, { measured: total, limit: budget, unit: currency }));
  }
  return { violations: out, applicable: true, note: `Total ${f(total)} of ${f(budget)} (${f(left)} left)` };
};

const r2: RuleFn = (inp, ctx) => {
  const out: Violation[] = [];
  const unknown: string[] = [];
  const unknownIds: string[] = [];
  for (const d of inp.days) {
    for (const it of d.items) {
      if (it.kind !== "visit") continue;
      const place = ctx.places.get(it.placeId);
      const win = openWindow(place?.hours ?? null, d.date);
      if (win === "closed") {
        out.push(viol("R2", "hard", "CLOSED_ON_DATE", `${short(it.name)} is closed on ${weekdayName(d.date)} ${d.date}.`, { dayIndex: d.dayIndex, itemIds: [it.placeId] }));
      } else if (win === "unknown") {
        unknown.push(short(it.name));
        unknownIds.push(it.placeId);
      } else {
        const start = hhmmToMin(it.start);
        const end = start + (place?.visitMin ?? 0);
        if (start < win.openMin) {
          out.push(viol("R2", "hard", "BEFORE_OPENING", `${short(it.name)} opens at ${minToHhmm(win.openMin)} but the visit starts at ${it.start}.`, { dayIndex: d.dayIndex, itemIds: [it.placeId], measured: start, limit: win.openMin, unit: "min" }));
        } else if (end > win.closeMin) {
          out.push(viol("R2", "hard", "CLOSES_BEFORE_END", `${short(it.name)} closes at ${minToHhmm(win.closeMin)} but the visit would end at ${minToHhmm(end)} on ${dayN(d.dayIndex)}.`, { dayIndex: d.dayIndex, itemIds: [it.placeId], measured: end, limit: win.closeMin, unit: "min" }));
        }
      }
      for (const adv of ctx.advisories) {
        if (adv.kind === "closure" && adv.affectsPlaceIds.includes(it.placeId)) {
          out.push(viol("R2", "soft", "REPORTED_CLOSURE", `A web report suggests ${short(it.name)} may be closed (unverified): "${short(adv.title)}".`, { dayIndex: d.dayIndex, itemIds: [it.placeId] }));
        }
      }
    }
  }
  if (unknown.length > 0) {
    out.push(viol("R2", "soft", "HOURS_UNVERIFIED", `Opening hours not verified for: ${unknown.slice(0, 6).join(", ")}${unknown.length > 6 ? ", ..." : ""}.`, { itemIds: unknownIds }));
  }
  return { violations: out, applicable: true, note: "Every stop is open during its visit" };
};

const r3: RuleFn = (inp, ctx) => {
  const out: Violation[] = [];
  const limit = ctx.request.accessibility.maxWalkKmPerDay;
  for (const d of inp.days) {
    const km = d.metrics.walkKm;
    if (limit !== null && km > limit) {
      out.push(viol("R3", "hard", "WALK_LIMIT", `${dayN(d.dayIndex)} needs about ${km} km of walking; the limit is ${limit} km.`, { dayIndex: d.dayIndex, measured: km, limit, unit: "km" }));
    } else if (limit === null && km > ctx.profile.defaultWalkKm) {
      out.push(viol("R3", "soft", "WALK_HIGH", `${dayN(d.dayIndex)} involves about ${km} km of walking (more than ~${ctx.profile.defaultWalkKm} km at a ${ctx.request.pace} pace).`, { dayIndex: d.dayIndex, measured: km, limit: ctx.profile.defaultWalkKm, unit: "km" }));
    }
  }
  const note = limit !== null ? `Walking within ${limit} km every day` : "Walking within pace defaults";
  return { violations: out, applicable: true, note };
};

const r4: RuleFn = (inp, ctx) => {
  const out: Violation[] = [];
  const max = ctx.profile.maxTransitMin;
  for (const d of inp.days) {
    if (d.metrics.transitMin > max) {
      out.push(viol("R4", "hard", "TRANSIT_TOO_LONG", `${dayN(d.dayIndex)} spends ${d.metrics.transitMin} min in transit; the ${ctx.request.pace} limit is ${max} min.`, { dayIndex: d.dayIndex, measured: d.metrics.transitMin, limit: max, unit: "min" }));
    }
  }
  return { violations: out, applicable: true, note: `Transit under ${max} min per day` };
};

const r5: RuleFn = (inp) => {
  const out: Violation[] = [];
  let anyWeather = false;
  for (const d of inp.days) {
    const w = d.weather;
    if (!w) continue;
    anyWeather = true;
    const outdoor = d.items.filter((i) => i.kind === "visit" && i.outdoor);
    const names = outdoor.map((i) => (i.kind === "visit" ? short(i.name) : "")).join(", ");
    const ids = outdoor.map((i) => (i.kind === "visit" ? i.placeId : ""));
    if (outdoor.length > 0 && w.rainProbPct !== null && w.rainProbPct >= RAIN_SOFT_PCT) {
      out.push(viol("R5", "soft", "RAIN_OUTDOOR", `${dayN(d.dayIndex)} has a ${w.rainProbPct}% chance of rain with outdoor stop(s): ${names}.`, { dayIndex: d.dayIndex, itemIds: ids, measured: w.rainProbPct, limit: RAIN_SOFT_PCT, unit: "%" }));
    }
    if (w.tMaxC !== null && w.tMaxC >= HEAT_SOFT_C) {
      const midday = outdoor.filter((i) => hhmmToMin(i.start) < 900 && hhmmToMin(i.end) > 720);
      if (midday.length > 0) {
        out.push(viol("R5", "soft", "HEAT_OUTDOOR", `${dayN(d.dayIndex)} reaches ${w.tMaxC} C with outdoor stops around midday.`, { dayIndex: d.dayIndex, measured: w.tMaxC, limit: HEAT_SOFT_C, unit: "C" }));
      }
    }
  }
  return { violations: out, applicable: anyWeather, note: anyWeather ? "No weather conflicts" : "Forecast not available for these dates" };
};

function stepFreeViolation(status: StepFreeStatus, name: string, id: string, dayIndex: number | undefined, what: string): Violation | null {
  const extra = dayIndex === undefined ? { itemIds: [id] } : { dayIndex, itemIds: [id] };
  if (status === "not_step_free") return viol("R6", "hard", what === "hotel" ? "NOT_STEP_FREE_LODGING" : "NOT_STEP_FREE", `${short(name)} (${what}) is not step-free.`, extra);
  if (status === "partial") return viol("R6", "soft", "PARTIAL_STEP_FREE", `${short(name)} (${what}) is only partly step-free.`, extra);
  return null;
}

const r6: RuleFn = (inp, ctx) => {
  if (!ctx.request.accessibility.stepFreeRequired) return { violations: [], applicable: false, note: "Step-free access not requested" };
  const out: Violation[] = [];
  const unverified: string[] = [];
  const unverifiedIds: string[] = [];
  const lv = stepFreeViolation(inp.lodging.stepFree, inp.lodging.name, inp.lodging.id, undefined, "hotel");
  if (lv) out.push(lv);
  if (inp.lodging.stepFree === "unverified") {
    unverified.push(short(inp.lodging.name));
    unverifiedIds.push(inp.lodging.id);
  }
  for (const d of inp.days) {
    for (const it of d.items) {
      if (it.kind !== "visit") continue;
      const v = stepFreeViolation(it.stepFree, it.name, it.placeId, d.dayIndex, "stop");
      if (v) out.push(v);
      if (it.stepFree === "unverified") {
        unverified.push(short(it.name));
        unverifiedIds.push(it.placeId);
      }
    }
  }
  if (unverified.length > 0) {
    out.push(viol("R6", "soft", "STEP_FREE_UNVERIFIED", `Step-free access not verified for: ${unverified.slice(0, 6).join(", ")}${unverified.length > 6 ? ", ..." : ""}.`, { itemIds: unverifiedIds }));
  }
  return { violations: out, applicable: true, note: "Every stop and the hotel are step-free" };
};

const r7: RuleFn = (inp, ctx) => {
  const out: Violation[] = [];
  const p = ctx.profile;
  for (const d of inp.days) {
    if (d.metrics.visits > p.maxVisits) {
      out.push(viol("R7", "hard", "TOO_MANY_STOPS", `${dayN(d.dayIndex)} has ${d.metrics.visits} stops; a ${ctx.request.pace} pace allows at most ${p.maxVisits}.`, { dayIndex: d.dayIndex, measured: d.metrics.visits, limit: p.maxVisits, unit: "stops" }));
    }
    if (d.metrics.visits > 0 && d.metrics.endMin > p.dayEndMin) {
      out.push(viol("R7", "hard", "DAY_TOO_LONG", `${dayN(d.dayIndex)} ends at ${minToHhmm(d.metrics.endMin)}, later than ${minToHhmm(p.dayEndMin)} for a ${ctx.request.pace} pace.`, { dayIndex: d.dayIndex, measured: d.metrics.endMin, limit: p.dayEndMin, unit: "min" }));
    }
  }
  return { violations: out, applicable: true, note: `At most ${p.maxVisits} stops, back by ${minToHhmm(p.dayEndMin)}` };
};

const r8: RuleFn = (inp, ctx) => {
  const applicable = ctx.request.pace === "relaxed" || ctx.request.accessibility.stepFreeRequired;
  if (!applicable) return { violations: [], applicable: false, note: "Rest checks apply to relaxed or step-free trips" };
  const out: Violation[] = [];
  const max = ctx.profile.maxActiveBlockMin;
  for (const d of inp.days) {
    if (d.metrics.longestActiveBlockMin > max) {
      out.push(viol("R8", "soft", "NO_REST", `${dayN(d.dayIndex)} has ${d.metrics.longestActiveBlockMin} min without a break (aim for at most ${max}).`, { dayIndex: d.dayIndex, measured: d.metrics.longestActiveBlockMin, limit: max, unit: "min" }));
    }
  }
  return { violations: out, applicable: true, note: `Breaks at least every ${max} min` };
};

const RULES: ReadonlyArray<readonly [RuleId, RuleFn]> = [
  ["R0", r0],
  ["R1", r1],
  ["R2", r2],
  ["R3", r3],
  ["R4", r4],
  ["R5", r5],
  ["R6", r6],
  ["R7", r7],
  ["R8", r8],
];

export function validatePlan(input: RuleInput, ctx: PlanningContext, round: number): ValidationReport {
  const outcomes: RuleOutcome[] = [];
  const violations: Violation[] = [];
  for (const [id, fn] of RULES) {
    const r = fn(input, ctx);
    violations.push(...r.violations);
    const hard = r.violations.filter((v) => v.severity === "hard");
    const status: RuleOutcome["status"] = hard.length > 0 ? "fail" : r.violations.length > 0 ? "warn" : r.applicable ? "pass" : "skip";
    const note = (hard[0] ?? r.violations[0])?.message ?? r.note;
    outcomes.push({ ruleId: id, status, note: `${RULE_TITLES[id]}: ${note}`.slice(0, 200) });
  }
  const hardCount = violations.filter((v) => v.severity === "hard").length;
  return {
    round,
    passed: hardCount === 0,
    outcomes,
    violations: violations.slice(0, 80),
    hardCount,
    softCount: violations.length - hardCount,
  };
}
