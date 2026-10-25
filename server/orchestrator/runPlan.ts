/**
 * The agent loop (state machine):
 *
 *   LOCATE -> SPECIALISTS (parallel: Explorer, MoodMatcher, ConditionsScout, BudgetKeeper)
 *   -> CONTEXT + ROUTE MATRIX -> FEASIBILITY (impossible budget -> HUMAN)
 *   -> round 0..3:  PLAN (Super; Ultra on round 3) -> ENFORCE directives
 *                   -> PROOF (Tavily Extract on the drafted stops whose step-free status is unknown; step-free trips)
 *                   -> BUILD (schedule + costs) -> RULES (R0-R8) -> pass ? FINALIZE : CRITIC (Super) -> REPLAN
 *   -> HUMAN (2 computed trade-off options)
 *
 * Invariants: bounded (<= 3 re-plans, RunBudget caps, deadline); every LLM step has a deterministic fallback;
 * the LLM never produces a number that reaches the user; this function never emits "usage"/"done" (the caller does).
 */
import type { Directive, Evidence, FinalItinerary, ModelRoutes, Place, TripRequest } from "../../types/travelverse.js";
import { newRunState, withTool, type AgentDeps, type AgentRun, type Emit } from "../agents/common.js";
import { runCritic, runPlanner } from "../agents/planner.js";
import { budgetHints, runBudgetKeeper, runConditionsScout, runExplorer, runMoodMatcher, runRouteMatrix } from "../agents/specialists.js";
import { FX_TABLE } from "../data/fx.js";
import { buildItinerary, isBetter } from "../engine/build.js";
import { draftPlaceIds, type NormalizedDraft, type PlanningContext } from "../engine/context.js";
import { formatMoney } from "../engine/money.js";
import { applyDirectives, greedyDraft, mergeDirectives, minimumFeasibleCostMinor, repairToFit } from "../engine/repair.js";
import { buildTradeoffs } from "../engine/tradeoff.js";
import { AppError, publicMessage, toAppError } from "../errors.js";
import { RunBudget, type UsageSnapshot } from "../runBudget.js";
import { runAccessibilityProof, type ProofTarget } from "../tavily/accessibilityProof.js";
import { buildPlanningContext, type ContextInput } from "./context.js";

export interface RunPlanInput {
  runId: string;
  request: TripRequest;
  routes: ModelRoutes;
  /** stop early (status "failed", llmFatal set) on auth/quota errors so the caller can switch to replay */
  bailOnLlmFatal: boolean;
}

export interface RunPlanResult {
  status: "finalized" | "awaiting_user" | "failed" | "cancelled";
  final: FinalItinerary | null;
  rounds: number;
  usage: UsageSnapshot;
  llmFatal: AppError | null;
}

const MIN_MS_FOR_ROUND = 45_000;
const MAX_PROOF_TARGETS = 6;

/** Drafted stops + hotel whose step-free status is still unknown/partial and not yet checked this run. */
export function proofTargetsForDraft(ctx: PlanningContext, draft: NormalizedDraft, checked: ReadonlySet<string>): ProofTarget[] {
  const out: ProofTarget[] = [];
  const lodging = ctx.lodging.get(draft.lodgingId);
  if (lodging && !lodging.id.startsWith("est:") && (lodging.stepFree === "unverified" || lodging.stepFree === "partial") && !checked.has(lodging.id)) {
    out.push({ id: lodging.id, name: lodging.name, kind: "lodging", url: lodging.officialUrl ?? null });
  }
  for (const id of draftPlaceIds(draft)) {
    const p = ctx.places.get(id);
    if (!p || checked.has(id) || (p.stepFree !== "unverified" && p.stepFree !== "partial")) continue;
    out.push({ id, name: p.name, kind: "place", url: p.officialUrl ?? null });
  }
  return out.sort((a, b) => Number(b.url !== null) - Number(a.url !== null)).slice(0, MAX_PROOF_TARGETS);
}

export async function runPlan(input: RunPlanInput, deps: AgentDeps, emit: Emit, signal: AbortSignal): Promise<RunPlanResult> {
  const budget = new RunBudget(deps.config.limits, deps.now);
  const run: AgentRun = { runId: input.runId, signal, budget, routes: input.routes, emit, deps, state: newRunState() };
  const req = input.request;
  let rounds = 0;
  const done = (status: RunPlanResult["status"], final: FinalItinerary | null = null): RunPlanResult => ({
    status,
    final,
    rounds,
    usage: budget.snapshot(),
    llmFatal: run.state.llmFatal,
  });
  const bail = () => input.bailOnLlmFatal && run.state.llmFatal !== null;

  emit({ type: "run_started", mode: "live", models: input.routes, destination: req.destination.slice(0, 80) });
  try {
    /* LOCATE */
    const pack = deps.findCityPack(req.destination);
    let center = pack?.center ?? null;
    let destinationName = pack?.name ?? req.destination;
    if (!center) {
      const g = await withTool(run, "explorer", "nominatim.search", { query: req.destination }, () => deps.tools.geocode(req.destination, signal));
      if (!g) {
        emit({ type: "error", code: "DESTINATION_NOT_FOUND", message: `Could not find "${req.destination.slice(0, 60)}" on the map.`, recoverable: true });
        return done("failed");
      }
      center = g.center;
      destinationName = g.name;
    }
    const f = (n: number) => formatMoney(n, req.budget.currency);
    emit({
      type: "thinking",
      agent: "orchestrator",
      text: `Planning ${req.startDate} to ${req.endDate} in ${destinationName} for ${req.travelers}, budget ${f(req.budget.amountMinor)}, ${req.pace} pace${req.accessibility.stepFreeRequired ? ", step-free only" : ""}. ${pack ? `Using curated data (${pack.places.length} places, ${pack.lodging.length} stays) plus live tools.` : "No curated data: OpenStreetMap + estimates (marked Estimated)."}`.slice(0, 600),
    });

    /* SPECIALISTS (parallel) */
    const fixedCenter = center;
    const explorerP = runExplorer(run, req, fixedCenter, pack);
    const placesP: Promise<readonly Place[]> = explorerP.then((ex) => [...(pack?.places ?? []), ...ex.places]);
    const moodP = pack ? runMoodMatcher(run, req, pack.places) : placesP.then((ps) => runMoodMatcher(run, req, ps));
    const conditionsP = runConditionsScout(run, req, fixedCenter, placesP);
    const strategyP = runBudgetKeeper(run, budgetHints(req, pack, fixedCenter, FX_TABLE), req.mood);
    const [ex, mood, cond, strategy] = await Promise.all([explorerP, moodP, conditionsP, strategyP]);
    if (bail()) return done("failed");

    /* CONTEXT + ROUTE MATRIX */
    const base: ContextInput = {
      runId: input.runId,
      request: req,
      destinationName,
      center: fixedCenter,
      pack,
      osmPlaces: ex.places,
      matrix: null,
      weather: cond.weather,
      advisories: cond.advisories,
      extraEvidence: [],
      rankedIds: mood.rankedIds,
      vibes: mood.vibes,
      fx: FX_TABLE,
      today: deps.today(),
    };
    let ctx = buildPlanningContext(base);
    if (ctx.places.size === 0) {
      emit({ type: "error", code: "NO_PLACES", message: "No attractions found for this destination right now. Try again or try the Udaipur demo.", recoverable: true });
      return done("failed");
    }
    const points = [
      ...[...ctx.lodging.values()].slice(0, 6).map((l) => ({ id: l.id, location: l.location })),
      ...ctx.rankedPlaceIds.slice(0, 24).flatMap((id) => {
        const p = ctx.places.get(id);
        return p ? [{ id, location: p.location }] : [];
      }),
    ];
    const matrix = await runRouteMatrix(run, points);
    let evidence: Evidence[] = [];
    ctx = buildPlanningContext({ ...base, matrix });

    /* FEASIBILITY */
    const minCost = minimumFeasibleCostMinor(ctx);
    if (minCost > req.budget.amountMinor) {
      emit({
        type: "thinking",
        agent: "orchestrator",
        text: `Even the cheapest suitable stay and meals cost ${f(minCost)}, above the ${f(req.budget.amountMinor)} budget. Skipping AI rounds; here are your options.`,
      });
      const meta = { round: 0, mode: "live" as const, model: "rules-engine", deterministicFallback: true };
      const start = repairToFit(greedyDraft(ctx, strategy), ctx, { fixBudget: false, meta }).draft;
      emit({ type: "tradeoff_required", round: 0, message: "The budget cannot cover the basics. Choose how to proceed.", options: buildTradeoffs(start, ctx, meta) });
      return done("awaiting_user");
    }

    /* PLAN -> PROOF -> RULES -> CRITIC loop */
    const maxReplans = deps.config.limits.maxReplans;
    const checked = new Set<string>();
    let directives: Directive[] = [];
    let mustFix: string[] = [];
    let previous: NormalizedDraft | null = null;
    let best: { itin: FinalItinerary; draft: NormalizedDraft } | null = null;

    for (let round = 0; round <= maxReplans; round++) {
      if (signal.aborted) return done("cancelled");
      if (bail()) return done("failed");
      rounds = round;
      const role = round > 0 && round === maxReplans ? "escalation" : "planner";
      if (round === 0) emit({ type: "thinking", agent: "planner", text: "Drafting the first plan from the specialists' findings." });
      else emit({ type: "replan", round, model: input.routes[role], reason: (mustFix.join(" ") || "Fix the flagged issues").slice(0, 300), directives });

      const p = await runPlanner(run, ctx, { round, role, directives, mustFix, previous, strategy });
      const enforced = round > 0 ? applyDirectives(p.draft, directives, ctx) : { draft: p.draft, applied: [] as Directive[], rejected: [] };
      if (round > 0 && !p.fallback && enforced.applied.length > 0) {
        emit({ type: "thinking", agent: "orchestrator", text: `Enforced ${enforced.applied.length} critic directive(s) the planner did not apply.` });
      }
      if (p.rationale) emit({ type: "thinking", agent: "planner", text: p.rationale });

      // Verify what we are actually about to visit: step-free claims for drafted stops come from official pages.
      if (req.accessibility.stepFreeRequired) {
        const targets = proofTargetsForDraft(ctx, enforced.draft, checked);
        if (targets.length > 0) {
          for (const t of targets) checked.add(t.id);
          const found = await runAccessibilityProof(run, targets, { destination: destinationName, officialDomains: pack?.officialDomains ?? [] });
          if (found.length > 0) {
            evidence = [...evidence, ...found];
            ctx = buildPlanningContext({ ...base, matrix, extraEvidence: evidence });
          }
        }
      }

      const itin = buildItinerary(enforced.draft, ctx, {
        round,
        mode: "live",
        model: p.model,
        deterministicFallback: p.fallback,
        unknownIds: p.unknownIds,
        duplicates: p.duplicates,
        lodgingReplaced: p.lodgingReplaced,
      });
      for (const outcome of itin.validation.outcomes) emit({ type: "rule_check", round, outcome });
      emit({ type: "draft", round, itinerary: itin });
      if (!best || isBetter(itin, best.itin)) best = { itin, draft: enforced.draft };

      if (itin.validation.passed) {
        emit({ type: "plan_finalized", itinerary: itin });
        return done("finalized", itin);
      }
      for (const v of itin.validation.violations.filter((x) => x.severity === "hard")) emit({ type: "critic_flag", round, violation: v });
      if (round === maxReplans) break;
      if (budget.remainingMs() < MIN_MS_FOR_ROUND) {
        emit({ type: "thinking", agent: "orchestrator", text: "Running out of time for another AI round; preparing options for you." });
        break;
      }
      const fb = await runCritic(run, ctx, itin, enforced.draft);
      emit({ type: "thinking", agent: "critic", text: fb.summary });
      directives = mergeDirectives(directives, fb.directives);
      mustFix = itin.validation.violations.filter((v) => v.severity === "hard").map((v) => `${v.ruleId}: ${v.message}`).slice(0, 8);
      previous = enforced.draft;
    }

    /* HUMAN */
    if (!best) throw new AppError("INTERNAL", "Loop ended without a draft");
    const meta = { round: best.itin.round, mode: "live" as const, model: "rules-engine", deterministicFallback: true };
    emit({
      type: "tradeoff_required",
      round: best.itin.round,
      message: "I could not satisfy every hard rule automatically. Pick the trade-off you prefer.",
      options: buildTradeoffs(best.draft, ctx, meta),
    });
    return done("awaiting_user");
  } catch (e) {
    const err = toAppError(e);
    if (err.code === "ABORTED" || signal.aborted) return done("cancelled");
    emit({ type: "error", code: err.code, message: publicMessage(err), recoverable: false });
    return done("failed");
  }
}
