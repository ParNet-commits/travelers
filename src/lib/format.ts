/** UI formatting helpers. Display only - every number comes from server engine output. */
import type { CurrencyCode, PricedAmount, StepFreeStatus } from "../../types/travelverse.js";

const EXP: Record<CurrencyCode, number> = { USD: 2, EUR: 2, GBP: 2, INR: 2 };

export function money(amountMinor: number, currency: CurrencyCode): string {
  const exp = EXP[currency];
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: exp, maximumFractionDigits: exp }).format(amountMinor / 10 ** exp);
}

export function shortModelName(id: string): string {
  const s = id.toLowerCase();
  if (s.includes("nano")) return "Nemotron Nano 30B";
  if (s.includes("super")) return "Nemotron Super 120B";
  if (s.includes("ultra")) return "Nemotron Ultra 550B";
  if (id === "rules-engine") return "Rules engine";
  return id.split("/").at(-1) ?? id;
}

export function provenanceLabel(p: PricedAmount): string {
  switch (p.provenance) {
    case "curated_table":
      return "Curated price";
    case "tavily_extract":
      return "From official page";
    case "osm":
      return "OpenStreetMap";
    case "osrm":
      return "Road distance";
    case "open_meteo":
      return "Forecast";
    case "derived":
      return "Calculated";
    case "estimate":
      return "Estimated";
  }
}

export const STEP_FREE_LABEL: Record<StepFreeStatus, string> = {
  step_free: "Step-free",
  partial: "Partly step-free",
  not_step_free: "Not step-free",
  unverified: "Unverified",
};

export const AGENT_LABEL: Record<string, string> = {
  orchestrator: "Orchestrator",
  planner: "Planner",
  critic: "Critic",
  mood_matcher: "MoodMatcher",
  explorer: "Explorer",
  conditions_scout: "ConditionsScout",
  budget_keeper: "BudgetKeeper",
  accessibility_proof: "Accessibility proof",
  rules_engine: "Rules engine",
};

export const RULE_SHORT: Record<string, string> = {
  R0: "Data",
  R1: "Budget",
  R2: "Hours",
  R3: "Walking",
  R4: "Transit",
  R5: "Weather",
  R6: "Step-free",
  R7: "Day length",
  R8: "Rest",
};
