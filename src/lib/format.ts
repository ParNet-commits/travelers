import type { CurrencyCode, DayWeather, PricedAmount, RuleId, StepFreeStatus } from "../../types/travelverse.js"; // imports domain contract types

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

export const RULE_SHORT: Record<string, string> = { // maps rule IDs to brief labels
  R0: "Data", // data integrity short label
  R1: "Budget", // budget limit short label
  R2: "Hours", // opening hours short label
  R3: "Walking", // walking distance short label
  R4: "Transit", // transit time short label
  R5: "Weather", // weather conditions short label
  R6: "Step-free", // wheelchair accessibility short label
  R7: "Day length", // day length short label
  R8: "Rest", // rest break short label
}; // ends RULE_SHORT

// Interface defining canonical name and plain-sentence explanation for each verification rule
export interface RuleDetails { // details for rule tooltip presentation
  readonly name: string; // full canonical rule name
  readonly description: string; // plain sentence explaining what deterministic rule checks
} // ends RuleDetails interface

// Map of canonical rule IDs (R0-R8) to their full names and single plain-sentence explanations
export const RULE_INFO: Readonly<Record<RuleId, RuleDetails>> = { // comprehensive dictionary for rule metadata
  R0: { // data integrity rule
    name: "Data integrity", // rule name
    description: "Verifies all visited places and stays exist in verified data without duplicates or unknown IDs.", // plain sentence on what it checks
  }, // ends R0
  R1: { // budget rule
    name: "Budget", // rule name
    description: "Ensures total estimated trip expenses stay strictly within your specified budget limit.", // plain sentence on what it checks
  }, // ends R1
  R2: { // opening hours rule
    name: "Opening hours", // rule name
    description: "Checks that every planned attraction is open and operating during scheduled visit times.", // plain sentence on what it checks
  }, // ends R2
  R3: { // walking distance rule
    name: "Walking distance", // rule name
    description: "Verifies daily walking distances remain within your requested mobility limits.", // plain sentence on what it checks
  }, // ends R3
  R4: { // transit time rule
    name: "Transit time", // rule name
    description: "Checks that daily travel times between stops remain within comfortable pacing limits.", // plain sentence on what it checks
  }, // ends R4
  R5: { // weather forecast rule
    name: "Weather", // rule name
    description: "Monitors forecast precipitation and extreme temperatures against scheduled outdoor activities.", // plain sentence on what it checks
  }, // ends R5
  R6: { // accessibility rule
    name: "Step-free access", // rule name
    description: "Verifies all venues and accommodations provide verified step-free wheelchair accessibility.", // plain sentence on what it checks
  }, // ends R6
  R7: { // day length rule
    name: "Day length", // rule name
    description: "Ensures daily itineraries have manageable stop counts and conclude before evening rest.", // plain sentence on what it checks
  }, // ends R7
  R8: { // rest break rule
    name: "Rest breaks", // rule name
    description: "Verifies schedules include dedicated afternoon rest periods between active blocks.", // plain sentence on what it checks
  }, // ends R8
}; // ends RULE_INFO mapping

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

// Threshold constant for rain probability percentage triggering umbrella packing tip
export const RAIN_PACKING_THRESHOLD_PCT = 30; // 30% rain chance threshold
// Threshold constant for maximum temperature in Celsius triggering sun hat and water tip
export const HEAT_PACKING_THRESHOLD_C = 32; // 32 degrees Celsius high temperature threshold
// Threshold constant for minimum temperature in Celsius triggering light jacket tip
export const CHILL_PACKING_THRESHOLD_C = 15; // 15 degrees Celsius cool evening threshold

// Intent: Compute one short packing tip from a given day's forecast rules
export function computePackingTip(weather: DayWeather | null | undefined): string | null { // exports packing tip calculator
  // Guard clause against missing weather data
  if (!weather) { // checks if weather object is null or undefined
    return null; // returns null when no forecast data is available
  } // ends weather guard

  // Check rain chance of 30% or more
  if (weather.rainProbPct !== null && weather.rainProbPct !== undefined && weather.rainProbPct >= RAIN_PACKING_THRESHOLD_PCT) { // rain threshold check
    return "Carry an umbrella"; // returns umbrella recommendation
  } // ends rain check

  // Check max temperature of 32°C or more
  if (weather.tMaxC !== null && weather.tMaxC !== undefined && weather.tMaxC >= HEAT_PACKING_THRESHOLD_C) { // maximum heat check
    return "Sun hat and water"; // returns sun protection recommendation
  } // ends heat check

  // Check min temperature of 15°C or less
  if (weather.tMinC !== null && weather.tMinC !== undefined && weather.tMinC <= CHILL_PACKING_THRESHOLD_C) { // cool evening check
    return "Light jacket for the evening"; // returns jacket recommendation
  } // ends chill check

  // Show nothing if no rule matches
  return null; // returns null when no forecast criteria are met
} // ends computePackingTip

