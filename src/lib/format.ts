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

// Constant offset to convert 0-indexed day numbers into 1-indexed user display numbers
const ONE_BASED_DAY_OFFSET = 1; // offset added to day numbers

// Intent: Transform 0-indexed day references from Planner/Critic text into friendly 1-indexed days (Day 1 to Day 4)
export function formatPlannerDayNumbers(text: string): string { // exports helper function
  // Guard clause for falsy or empty string input
  if (!text) { // checks if text is empty
    return ""; // returns empty string safely
  } // ends guard

  // Check if text refers to 0-indexed days (e.g. "Day 0", "day 0", "Day 0 to Day 3", etc.)
  const hasZeroIndexedDay = /\bday\s*0\b/i.test(text); // detects presence of Day 0
  if (!hasZeroIndexedDay) { // checks if zero-indexed day is absent
    return text; // returns original text without modifications
  } // ends zero index check

  // Single-pass replacement for day ranges ("Day 0 to Day 3", "Day 0 - 3") and individual days ("Day 0")
  return text.replace( // regex replacement
    /\b([Dd]ay)\s*(\d+)(?:\s*(-|–|to|through)\s*([Dd]ay\s*)?(\d+))?\b/g, // captures range or single day
    (_match, prefix, startStr, sep, secondPrefix, endStr) => { // replacement callback
      const startNum = parseInt(startStr, 10); // parses start day number
      // Check if end day number exists in range
      if (endStr !== undefined) { // range check
        const endNum = parseInt(endStr, 10); // parses end day number
        const secondDayPrefix = secondPrefix ? secondPrefix : ""; // optional second prefix like 'Day '
        return `${prefix} ${startNum + ONE_BASED_DAY_OFFSET} ${sep} ${secondDayPrefix}${endNum + ONE_BASED_DAY_OFFSET}`; // returns shifted range
      } // ends range check
      // Format single day reference
      return `${prefix} ${startNum + ONE_BASED_DAY_OFFSET}`; // returns shifted single day
    } // ends callback
  ); // ends replace
} // ends formatPlannerDayNumbers

