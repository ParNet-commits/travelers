/**
 * TravelVerse shared contracts (client + server).
 * Single source of truth: every API body, SSE event, LLM output and tool response is a Zod schema here.
 * Rules: no `any`, money is integer minor units, every number carries provenance.
 * This file imports only "zod" so both Vite (bundler) and Node (NodeNext) can load it.
 */
import { z } from "zod";

/* ============================== 1. Primitives ============================== */

export const CURRENCIES = ["USD", "EUR", "GBP", "INR"] as const;
export const CurrencyCode = z.enum(CURRENCIES);
export type CurrencyCode = z.infer<typeof CurrencyCode>;

export const IsoDate = z.iso.date();
export const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24h)");
export const HttpUrl = z.url({ protocol: /^https?$/ });

/** Ids created by code: lowercase, e.g. "udaipur:city-palace", "osm:w123", "est:lodging-mid". */
export const Id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_:.-]*$/, "Lowercase id expected");
/** Ids coming back from an LLM: accepted loosely, normalized + looked up by code. */
export const LooseId = z.string().trim().min(1).max(80);

export const Provenance = z.enum([
  "curated_table",
  "tavily_extract",
  "osm",
  "osrm",
  "open_meteo",
  "derived",
  "estimate",
]);
export type Provenance = z.infer<typeof Provenance>;

export const PricedAmount = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: CurrencyCode,
  provenance: Provenance,
  sourceUrl: HttpUrl.optional(),
  asOf: IsoDate.optional(),
  note: z.string().max(200).optional(),
});
export type PricedAmount = z.infer<typeof PricedAmount>;

export const LatLon = z.object({
  lat: z.number().gte(-90).lte(90),
  lon: z.number().gte(-180).lte(180),
});
export type LatLon = z.infer<typeof LatLon>;

export const Pace = z.enum(["relaxed", "balanced", "packed"]);
export type Pace = z.infer<typeof Pace>;
export const StepFreeStatus = z.enum(["step_free", "partial", "not_step_free", "unverified"]);
export type StepFreeStatus = z.infer<typeof StepFreeStatus>;
export const PlaceCategory = z.enum([
  "heritage",
  "museum",
  "viewpoint",
  "garden",
  "market",
  "religious",
  "waterfront",
  "nature",
  "experience",
  "show",
]);
export type PlaceCategory = z.infer<typeof PlaceCategory>;
export const VibeTag = z.enum([
  "romantic",
  "calm",
  "cultural",
  "scenic",
  "spiritual",
  "foodie",
  "adventurous",
  "family",
  "shopping",
  "nightlife",
  "nature",
  "photography",
  "luxury",
  "budget",
]);
export type VibeTag = z.infer<typeof VibeTag>;
export const Tier = z.enum(["budget", "mid", "premium"]);
export type Tier = z.infer<typeof Tier>;
export const RuleId = z.enum(["R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"]);
export type RuleId = z.infer<typeof RuleId>;
export const Severity = z.enum(["hard", "soft"]);
export type Severity = z.infer<typeof Severity>;
export const ModelRole = z.enum(["fast", "planner", "escalation"]);
export type ModelRole = z.infer<typeof ModelRole>;
export const RunMode = z.enum(["live", "replay"]);
export type RunMode = z.infer<typeof RunMode>;
export const AgentName = z.enum([
  "orchestrator",
  "planner",
  "critic",
  "mood_matcher",
  "explorer",
  "conditions_scout",
  "budget_keeper",
  "accessibility_proof",
  "rules_engine",
]);
export type AgentName = z.infer<typeof AgentName>;
export const ToolName = z.enum([
  "nominatim.search",
  "overpass.query",
  "osrm.table",
  "open_meteo.forecast",
  "tavily.search",
  "tavily.extract",
]);
export type ToolName = z.infer<typeof ToolName>;

export const ModelRoutes = z.object({
  fast: z.string().min(3).max(120),
  planner: z.string().min(3).max(120),
  escalation: z.string().min(3).max(120),
});
export type ModelRoutes = z.infer<typeof ModelRoutes>;

/* ============================== 2. Request ============================== */

export const AccessibilityNeeds = z.object({
  stepFreeRequired: z.boolean(),
  /** null = no explicit limit (pace default applies as a soft rule) */
  maxWalkKmPerDay: z.number().min(0.5).max(30).nullable(),
  notes: z.string().trim().max(200),
});

/** Inclusive day count between two YYYY-MM-DD dates (UTC calendar math). */
export function dayCount(startDate: string, endDate: string): number {
  const a = Date.parse(`${startDate}T00:00:00Z`);
  const b = Date.parse(`${endDate}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

export const TripRequest = z
  .object({
    origin: z.string().trim().min(2).max(80),
    destination: z.string().trim().min(2).max(80),
    startDate: IsoDate,
    endDate: IsoDate,
    travelers: z.number().int().min(1).max(8),
    budget: z.object({
      amountMinor: z.number().int().min(100).max(100_000_000),
      currency: CurrencyCode,
    }),
    pace: Pace,
    mood: z.string().trim().max(280),
    accessibility: AccessibilityNeeds,
  })
  .superRefine((r, ctx) => {
    const days = dayCount(r.startDate, r.endDate);
    if (days < 1) ctx.addIssue({ code: "custom", path: ["endDate"], message: "endDate must be on or after startDate" });
    if (days > 7) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Trips are limited to 7 days" });
  });
export type TripRequest = z.infer<typeof TripRequest>;

export const PlanRequestBody = z.object({
  trip: TripRequest,
  mode: RunMode,
  presetId: z.enum(["riya"]).nullable(),
  /** Admin-only (x-tv-admin header). Each id must be on the server allowlist. */
  routeOverride: ModelRoutes.partial().nullable(),
});
export type PlanRequestBody = z.infer<typeof PlanRequestBody>;

/* ============================== 3. Domain data ============================== */

export const HoursRule = z.object({
  /** 0 = Sunday ... 6 = Saturday */
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  open: HHMM,
  close: HHMM,
});
export const OpeningHours = z.object({
  rules: z.array(HoursRule).min(1).max(7),
  closedDates: z.array(IsoDate).max(60).optional(),
  sourceUrl: HttpUrl.optional(),
  asOf: IsoDate.optional(),
});
export type OpeningHours = z.infer<typeof OpeningHours>;

export const Evidence = z.object({
  targetId: Id,
  status: StepFreeStatus,
  method: z.enum(["curated", "tavily_extract", "osm_tag"]),
  url: HttpUrl.optional(),
  domain: z.string().max(120).optional(),
  quote: z.string().max(400).optional(),
  verbatimVerified: z.boolean(),
  official: z.boolean(),
  retrievedAt: IsoDate,
});
export type Evidence = z.infer<typeof Evidence>;

export const Place = z.object({
  id: Id,
  name: z.string().min(1).max(120),
  category: PlaceCategory,
  location: LatLon,
  visitMin: z.number().int().min(10).max(480),
  /** null = unknown -> the estimate table applies (provenance "estimate") */
  ticketPerPerson: PricedAmount.nullable(),
  /** null = unknown -> R2 reports a soft "hours unverified" warning */
  hours: OpeningHours.nullable(),
  stepFree: StepFreeStatus,
  stepFreeNote: z.string().max(200).optional(),
  /** where the step-free status comes from (official page, accessibility guide) */
  stepFreeSourceUrl: HttpUrl.optional(),
  onSiteWalkKm: z.number().min(0).max(10).optional(),
  outdoor: z.boolean(),
  vibes: z.array(VibeTag).max(6),
  officialUrl: HttpUrl.optional(),
  source: z.enum(["curated", "osm"]),
  osmRef: z.string().max(40).optional(),
});
export type Place = z.infer<typeof Place>;

export const Lodging = z.object({
  id: Id,
  name: z.string().min(1).max(120),
  tier: Tier,
  location: LatLon,
  nightlyPerRoom: PricedAmount,
  stepFree: StepFreeStatus,
  stepFreeNote: z.string().max(200).optional(),
  stepFreeSourceUrl: HttpUrl.optional(),
  officialUrl: HttpUrl.optional(),
});
export type Lodging = z.infer<typeof Lodging>;

export const CityPack = z.object({
  id: Id,
  name: z.string().min(2).max(80),
  aliases: z.array(z.string().min(2).max(80)).max(10),
  country: z.string().length(2),
  currency: CurrencyCode,
  center: LatLon,
  timezone: z.string().min(3).max(60),
  places: z.array(Place).min(3).max(80),
  lodging: z.array(Lodging).min(1).max(20),
  mealsPerPersonPerDay: z.object({ budget: PricedAmount, mid: PricedAmount, premium: PricedAmount }),
  localTransport: z.object({
    baseFare: PricedAmount,
    perKm: PricedAmount,
    seatsPerVehicle: z.number().int().min(1).max(8),
  }),
  arrivals: z
    .array(
      z.object({
        fromCity: z.string().min(2).max(80),
        mode: z.enum(["flight", "train", "bus", "car"]),
        roundTripPerPerson: PricedAmount,
      }),
    )
    .max(10),
  /** Domains treated as "official" by the Accessibility Proof Engine, e.g. "eternalmewar.in" */
  officialDomains: z.array(z.string().min(3).max(120)).max(30),
});
export type CityPack = z.infer<typeof CityPack>;

export const FxTable = z.object({
  base: z.literal("USD"),
  asOf: IsoDate,
  source: z.string().min(3).max(120),
  sourceUrl: HttpUrl.optional(),
  /** units of each currency per 1 USD, as decimal strings, e.g. { USD: "1", INR: "88.25" } */
  perUsd: z.record(CurrencyCode, z.string().regex(/^\d+(\.\d{1,6})?$/)),
});
export type FxTable = z.infer<typeof FxTable>;

export const TravelMatrix = z.object({
  ids: z.array(Id).max(40),
  durationsSec: z.array(z.array(z.number().nonnegative().nullable())),
  distancesM: z.array(z.array(z.number().nonnegative().nullable())),
});
export type TravelMatrix = z.infer<typeof TravelMatrix>;

export const DayWeather = z.object({
  date: IsoDate,
  weatherCode: z.number().int(),
  label: z.string().max(40),
  tMaxC: z.number().nullable(),
  tMinC: z.number().nullable(),
  rainProbPct: z.number().min(0).max(100).nullable(),
});
export type DayWeather = z.infer<typeof DayWeather>;

export const Advisory = z.object({
  id: z.string().max(12),
  kind: z.enum(["closure", "event", "advisory", "other"]),
  title: z.string().max(200),
  url: HttpUrl,
  snippet: z.string().max(400),
  publishedDate: z.string().max(40).optional(),
  affectsPlaceIds: z.array(Id).max(5),
  /** Web content is never treated as verified fact. */
  verified: z.literal(false),
});
export type Advisory = z.infer<typeof Advisory>;

/* ============================== 4. Tool result schemas (raw API shapes) ============================== */

export const NominatimResult = z.array(
  z.object({
    place_id: z.number(),
    lat: z.coerce.number(),
    lon: z.coerce.number(),
    display_name: z.string(),
    name: z.string().optional(),
    type: z.string().optional(),
    importance: z.number().optional(),
  }),
);

export const OverpassResponse = z.object({
  elements: z.array(
    z.object({
      type: z.enum(["node", "way", "relation"]),
      id: z.number(),
      lat: z.number().optional(),
      lon: z.number().optional(),
      center: z.object({ lat: z.number(), lon: z.number() }).optional(),
      tags: z.record(z.string(), z.string()).optional(),
    }),
  ),
  remark: z.string().optional(),
});
export type OverpassResponse = z.infer<typeof OverpassResponse>;

export const OsrmTableResponse = z.object({
  code: z.string(),
  message: z.string().optional(),
  durations: z.array(z.array(z.number().nullable())).optional(),
  distances: z.array(z.array(z.number().nullable())).optional(),
});

export const OpenMeteoResponse = z.object({
  timezone: z.string().optional(),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number().nullable()),
    temperature_2m_max: z.array(z.number().nullable()),
    temperature_2m_min: z.array(z.number().nullable()),
    precipitation_probability_max: z.array(z.number().nullable()).optional(),
  }),
});

export const TavilySearchResponse = z.object({
  query: z.string().optional(),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      content: z.string(),
      score: z.number().optional(),
      published_date: z.string().optional(),
    }),
  ),
  request_id: z.string().optional(),
});
export type TavilySearchResponse = z.infer<typeof TavilySearchResponse>;

export const TavilyExtractResponse = z.object({
  results: z.array(z.object({ url: z.string(), raw_content: z.string().nullable().optional() })),
  failed_results: z.array(z.object({ url: z.string(), error: z.string().optional() })).optional(),
  request_id: z.string().optional(),
});
export type TavilyExtractResponse = z.infer<typeof TavilyExtractResponse>;

export const TavilyUsageResponse = z.object({
  key: z
    .object({ usage: z.number().nullable().optional(), limit: z.number().nullable().optional() })
    .optional(),
  account: z
    .object({
      current_plan: z.string().nullable().optional(),
      plan_usage: z.number().nullable().optional(),
      plan_limit: z.number().nullable().optional(),
    })
    .optional(),
});

/* ============================== 5. LLM output schemas (what Nemotron may return) ============================== */

export const PlannerDraft = z.object({
  lodgingId: LooseId,
  mealTier: Tier,
  days: z
    .array(
      z.object({
        dayIndex: z.number().int().min(0).max(6),
        theme: z.string().max(60),
        placeIds: z.array(LooseId).max(8),
      }),
    )
    .min(1)
    .max(7),
  rationale: z.string().max(600),
});
export type PlannerDraft = z.infer<typeof PlannerDraft>;

const directiveCommon = {
  reason: z.string().max(200),
  addresses: z.array(RuleId).max(4),
};
export const Directive = z.discriminatedUnion("op", [
  z.object({ op: z.literal("drop_place"), placeId: LooseId, ...directiveCommon }),
  z.object({ op: z.literal("swap_place"), placeId: LooseId, replacementId: LooseId, ...directiveCommon }),
  z.object({ op: z.literal("change_lodging"), lodgingId: LooseId, ...directiveCommon }),
  z.object({ op: z.literal("change_meal_tier"), mealTier: Tier, ...directiveCommon }),
  z.object({
    op: z.literal("move_place"),
    placeId: LooseId,
    toDayIndex: z.number().int().min(0).max(6),
    ...directiveCommon,
  }),
]);
export type Directive = z.infer<typeof Directive>;

export const CriticFeedback = z.object({
  summary: z.string().max(400),
  directives: z.array(Directive).max(8),
});
export type CriticFeedback = z.infer<typeof CriticFeedback>;

export const MoodProfile = z.object({
  vibeTags: z.array(VibeTag).max(6),
  rankedPlaceIds: z.array(LooseId).max(30),
  avoidCategories: z.array(PlaceCategory).max(5),
  summary: z.string().max(240),
});
export type MoodProfile = z.infer<typeof MoodProfile>;

export const ExplorePlan = z.object({
  categories: z.array(PlaceCategory).min(1).max(6),
  radiusKm: z.number().min(1).max(25),
  note: z.string().max(200),
});
export type ExplorePlan = z.infer<typeof ExplorePlan>;

export const BudgetStrategy = z.object({
  lodgingTier: Tier,
  mealTier: Tier,
  splitPct: z.object({
    lodging: z.number().int().min(0).max(100),
    food: z.number().int().min(0).max(100),
    activities: z.number().int().min(0).max(100),
    transport: z.number().int().min(0).max(100),
    buffer: z.number().int().min(0).max(100),
  }),
  rationale: z.string().max(300),
});
export type BudgetStrategy = z.infer<typeof BudgetStrategy>;

export const ConditionsTriage = z.object({
  items: z
    .array(
      z.object({
        resultId: z.string().max(12),
        relevant: z.boolean(),
        kind: z.enum(["closure", "event", "advisory", "other"]),
        affectsPlaceIds: z.array(LooseId).max(5),
      }),
    )
    .max(12),
});
export type ConditionsTriage = z.infer<typeof ConditionsTriage>;

export const AccessibilityVerdicts = z.object({
  verdicts: z
    .array(
      z.object({
        targetId: LooseId,
        status: StepFreeStatus,
        sentenceId: z.string().max(12),
        quote: z.string().max(400),
      }),
    )
    .max(12),
});
export type AccessibilityVerdicts = z.infer<typeof AccessibilityVerdicts>;

/* ============================== 6. Itinerary, validation, trade-offs ============================== */

const itemBase = { id: z.string().max(40), start: HHMM, end: HHMM };

export const VisitItem = z.object({
  kind: z.literal("visit"),
  ...itemBase,
  placeId: Id,
  name: z.string().max(120),
  category: PlaceCategory,
  location: LatLon,
  /** party total, converted to the budget currency */
  cost: PricedAmount,
  /** party total in the source currency (shown as "INR 800 = USD 9.07") */
  costOriginal: PricedAmount,
  stepFree: StepFreeStatus,
  evidence: z.array(Evidence).max(3),
  outdoor: z.boolean(),
  hoursLabel: z.string().max(60),
});
export const TransitItem = z.object({
  kind: z.literal("transit"),
  ...itemBase,
  fromId: z.string().max(64),
  toId: z.string().max(64),
  mode: z.enum(["walk", "taxi"]),
  distanceKm: z.number().nonnegative(),
  durationMin: z.number().int().nonnegative(),
  cost: PricedAmount,
  costOriginal: PricedAmount,
});
export const MealItem = z.object({ kind: z.literal("meal"), ...itemBase, label: z.literal("Lunch") });
export const RestItem = z.object({ kind: z.literal("rest"), ...itemBase, reason: z.string().max(80) });
export const ItineraryItem = z.discriminatedUnion("kind", [VisitItem, TransitItem, MealItem, RestItem]);
export type ItineraryItem = z.infer<typeof ItineraryItem>;
export type VisitItem = z.infer<typeof VisitItem>;
export type TransitItem = z.infer<typeof TransitItem>;

export const DayMetrics = z.object({
  visits: z.number().int().nonnegative(),
  walkKm: z.number().nonnegative(),
  transitMin: z.number().int().nonnegative(),
  startMin: z.number().int().nonnegative(),
  endMin: z.number().int().nonnegative(),
  longestActiveBlockMin: z.number().int().nonnegative(),
});
export type DayMetrics = z.infer<typeof DayMetrics>;

export const DayPlan = z.object({
  dayIndex: z.number().int().min(0).max(6),
  date: IsoDate,
  theme: z.string().max(60),
  weather: DayWeather.nullable(),
  items: z.array(ItineraryItem).max(48),
  metrics: DayMetrics,
});
export type DayPlan = z.infer<typeof DayPlan>;

export const CostCategory = z.enum(["lodging", "meals", "tickets", "local_transport", "arrival"]);
export type CostCategory = z.infer<typeof CostCategory>;
export const CostLine = z.object({
  category: CostCategory,
  label: z.string().max(160),
  amount: PricedAmount,
  original: PricedAmount,
});
export type CostLine = z.infer<typeof CostLine>;
export const CostBreakdown = z.object({
  currency: CurrencyCode,
  lines: z.array(CostLine).max(80),
  totalsMinor: z.record(CostCategory, z.number().int().nonnegative()),
  grandTotalMinor: z.number().int().nonnegative(),
  budgetMinor: z.number().int().positive(),
  /** negative when over budget */
  remainingMinor: z.number().int(),
  /** share of the grand total that comes from "estimate" provenance, in basis points (0..10000) */
  estimateShareBps: z.number().int().min(0).max(10_000),
  fx: z.object({ asOf: IsoDate, source: z.string().max(120) }).nullable(),
});
export type CostBreakdown = z.infer<typeof CostBreakdown>;

export const Violation = z.object({
  ruleId: RuleId,
  severity: Severity,
  code: z.string().max(40),
  message: z.string().max(300),
  dayIndex: z.number().int().nullable(),
  itemIds: z.array(z.string().max(64)).max(10),
  measured: z.number().nullable(),
  limit: z.number().nullable(),
  unit: z.string().max(12).nullable(),
});
export type Violation = z.infer<typeof Violation>;

export const RuleOutcome = z.object({
  ruleId: RuleId,
  status: z.enum(["pass", "fail", "warn", "skip"]),
  note: z.string().max(200),
});
export type RuleOutcome = z.infer<typeof RuleOutcome>;

export const ValidationReport = z.object({
  round: z.number().int().min(0).max(9),
  passed: z.boolean(),
  outcomes: z.array(RuleOutcome).length(9),
  violations: z.array(Violation).max(80),
  hardCount: z.number().int().nonnegative(),
  softCount: z.number().int().nonnegative(),
});
export type ValidationReport = z.infer<typeof ValidationReport>;

export const AccessibilityAudit = z.object({
  required: z.boolean(),
  stops: z.number().int().nonnegative(),
  stepFree: z.number().int().nonnegative(),
  partial: z.number().int().nonnegative(),
  notStepFree: z.number().int().nonnegative(),
  unverified: z.number().int().nonnegative(),
  /** stops whose status is backed by a verbatim quote or curated source */
  evidenced: z.number().int().nonnegative(),
  sources: z.array(z.object({ domain: z.string().max(120), url: HttpUrl, official: z.boolean() })).max(16),
  badge: z.enum(["verified", "partially_verified", "unverified", "not_required"]),
});
export type AccessibilityAudit = z.infer<typeof AccessibilityAudit>;

export const FinalItinerary = z.object({
  runId: z.string().max(40),
  round: z.number().int().min(0).max(9),
  mode: RunMode,
  request: TripRequest,
  destinationName: z.string().max(80),
  lodging: z.object({
    id: Id,
    name: z.string().max(120),
    tier: Tier,
    nights: z.number().int().nonnegative(),
    rooms: z.number().int().positive(),
    location: LatLon,
    stepFree: StepFreeStatus,
    evidence: z.array(Evidence).max(3),
  }),
  mealTier: Tier,
  days: z.array(DayPlan).min(1).max(7),
  costs: CostBreakdown,
  validation: ValidationReport,
  audit: AccessibilityAudit,
  dropped: z.object({
    unknownIds: z.array(z.string().max(80)).max(30),
    duplicates: z.array(z.string().max(80)).max(30),
  }),
  generatedBy: z.object({ model: z.string().max(120), deterministicFallback: z.boolean() }),
});
export type FinalItinerary = z.infer<typeof FinalItinerary>;

export const TradeoffOption = z.object({
  id: z.enum(["A", "B"]),
  title: z.string().max(80),
  summary: z.string().max(300),
  deltaBudgetMinor: z.number().int(),
  changes: z.array(z.string().max(200)).max(12),
  itinerary: FinalItinerary,
});
export type TradeoffOption = z.infer<typeof TradeoffOption>;

/* ============================== 7. SSE events ============================== */

const evBase = {
  seq: z.number().int().nonnegative(),
  t: z.number().int().nonnegative(),
  runId: z.string().max(40),
};
const argValue = z.union([z.string().max(400), z.number(), z.boolean()]);

export const SSEEvent = z.discriminatedUnion("type", [
  z.object({ ...evBase, type: z.literal("run_started"), mode: RunMode, models: ModelRoutes, destination: z.string().max(80) }),
  z.object({ ...evBase, type: z.literal("thinking"), agent: AgentName, text: z.string().max(600) }),
  z.object({
    ...evBase,
    type: z.literal("llm_call"),
    agent: AgentName,
    model: z.string().max(120),
    ok: z.boolean(),
    ms: z.number().int().nonnegative(),
    tokensIn: z.number().int().nonnegative(),
    tokensOut: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
    attempts: z.number().int().positive(),
    note: z.string().max(200),
  }),
  z.object({
    ...evBase,
    type: z.literal("tool_call"),
    agent: AgentName,
    callId: z.string().max(24),
    tool: ToolName,
    args: z.record(z.string(), argValue),
  }),
  z.object({
    ...evBase,
    type: z.literal("tool_result"),
    agent: AgentName,
    callId: z.string().max(24),
    tool: ToolName,
    ok: z.boolean(),
    cached: z.boolean(),
    ms: z.number().int().nonnegative(),
    summary: z.string().max(300),
  }),
  z.object({ ...evBase, type: z.literal("rule_check"), round: z.number().int(), outcome: RuleOutcome }),
  z.object({ ...evBase, type: z.literal("critic_flag"), round: z.number().int(), violation: Violation }),
  z.object({ ...evBase, type: z.literal("draft"), round: z.number().int(), itinerary: FinalItinerary }),
  z.object({
    ...evBase,
    type: z.literal("replan"),
    round: z.number().int(),
    model: z.string().max(120),
    reason: z.string().max(300),
    directives: z.array(Directive).max(12),
  }),
  z.object({
    ...evBase,
    type: z.literal("tradeoff_required"),
    round: z.number().int(),
    message: z.string().max(300),
    options: z.array(TradeoffOption).min(1).max(2),
  }),
  z.object({ ...evBase, type: z.literal("plan_finalized"), itinerary: FinalItinerary }),
  z.object({ ...evBase, type: z.literal("replay_notice"), reason: z.string().max(300), recordedAt: z.string().max(40) }),
  z.object({
    ...evBase,
    type: z.literal("usage"),
    llmCalls: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
    tokensIn: z.number().int().nonnegative(),
    tokensOut: z.number().int().nonnegative(),
    estUsd: z.number().nonnegative(),
    tavilyCredits: z.number().int().nonnegative(),
    elapsedMs: z.number().int().nonnegative(),
  }),
  z.object({
    ...evBase,
    type: z.literal("error"),
    code: z.string().max(40),
    message: z.string().max(300),
    recoverable: z.boolean(),
  }),
  z.object({ ...evBase, type: z.literal("done"), status: z.enum(["finalized", "awaiting_user", "failed", "cancelled"]) }),
]);
export type SSEEvent = z.infer<typeof SSEEvent>;
export type SSEEventType = SSEEvent["type"];

/** Omit that distributes over unions (keeps the discriminant working). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** What server code passes to emit(): seq, t and runId are added by the SSE layer. */
export type SSEEventInput = DistributiveOmit<SSEEvent, "seq" | "t" | "runId">;

/* ============================== 8. Replay + Control Room ============================== */

export const GoldenRun = z.object({
  id: z.string().max(40),
  recordedAt: z.string().max(40),
  request: TripRequest,
  models: ModelRoutes,
  events: z.array(SSEEvent).max(1000),
});
export type GoldenRun = z.infer<typeof GoldenRun>;

export const BreakerState = z.object({
  host: z.string().max(120),
  state: z.enum(["closed", "open", "half_open"]),
  failures: z.number().int().nonnegative(),
});

export const HealthResponse = z.object({
  ok: z.boolean(),
  version: z.string().max(40),
  liveEnabled: z.boolean(),
  keys: z.object({ nebius: z.boolean(), tavily: z.boolean(), admin: z.boolean(), contactEmail: z.boolean() }),
  models: ModelRoutes,
  allowlist: z.array(z.string().max(120)).max(20),
  limits: z.object({
    maxUsdPerRun: z.number(),
    runsPerIpPerHour: z.number().int(),
    maxReplans: z.number().int(),
    deadlineMs: z.number().int(),
  }),
  replays: z.array(z.object({ id: z.string(), recordedAt: z.string() })).max(10),
  instance: z.object({
    startedAt: z.string(),
    runs: z.number().int(),
    liveRuns: z.number().int(),
    replayRuns: z.number().int(),
    estUsd: z.number(),
    tavilyCredits: z.number().int(),
    breakers: z.array(BreakerState).max(20),
    cache: z.object({ entries: z.number().int(), hits: z.number().int(), misses: z.number().int() }),
    recentRuns: z
      .array(
        z.object({
          at: z.string(),
          destination: z.string().max(80),
          mode: RunMode,
          status: z.string().max(20),
          rounds: z.number().int(),
          estUsd: z.number(),
          ms: z.number().int(),
        }),
      )
      .max(20),
  }),
  deep: z
    .object({
      checkedAt: z.string(),
      providers: z
        .array(z.object({ name: z.string().max(40), ok: z.boolean(), ms: z.number().int(), detail: z.string().max(300) }))
        .max(12),
      models: z.array(z.object({ id: z.string().max(120), found: z.boolean(), note: z.string().max(200) })).max(12),
      tavily: z
        .object({ plan: z.string().max(60), used: z.number().nullable(), limit: z.number().nullable() })
        .nullable(),
    })
    .nullable(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
