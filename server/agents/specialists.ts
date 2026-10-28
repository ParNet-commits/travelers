/**
 * Four Nano specialists. Pattern: LLM decides (ids/enums only) -> code executes tools -> code validates.
 * Every specialist has a deterministic fallback, so a failed model call never stops a run.
 */
import {
  BudgetStrategy,
  ConditionsTriage,
  ExplorePlan,
  MoodProfile,
  NominatimResult, // schema for validating Nominatim search responses
  PlaceCategory,
  VibeTag,
  type Advisory,
  type CityPack,
  type DayWeather,
  type FxTable,
  type LatLon,
  type Place,
  type Tier,
  type TravelMatrix,
  type TripRequest,
} from "../../types/travelverse.js";
import { TIMEOUTS } from "../config.js"; // standard timeout configurations for external tools
import { convertMinor, formatMoney, mulMinor } from "../engine/money.js";
import { normalizeId } from "../engine/normalize.js";
import { DEFAULT_VISIT_MIN, OUTDOOR_CATEGORY, TIER_ORDER } from "../engine/profiles.js"; // default profiles and visit times
import { dayCount } from "../../types/travelverse.js";
import { fetchJson } from "../http/fetchJson.js"; // unified HTTP client with timeouts, retries and cache
import { BUDGET_SYSTEM, EXPLORER_SYSTEM, MOOD_SYSTEM, TRIAGE_SYSTEM } from "../llm/prompts.js";
import { defaultRanking, estimateLodging, estimateMeals } from "../orchestrator/context.js";
import { detectInjection, sanitizeExternalText, wrapUntrusted } from "../security/untrusted.js"; // untrusted input sanitizers
import { CATEGORY_VIBES, userAgent } from "../tools/osm.js"; // category vibe mappings and user agent header generator
import type { WebHit } from "../tools/types.js";
import { llmJson, short, withTool, type AgentRun } from "./common.js";

/* ---------------- MoodMatcher ---------------- */

const MOOD_KEYWORDS: Readonly<Record<VibeTag, RegExp>> = {
  romantic: /anniversar|romantic|honeymoon|couple|love|wife|husband|partner/i,
  calm: /calm|relax|slow|peace|quiet|easy|rest/i,
  cultural: /cultur|histor|heritage|museum|art|palace|architect/i,
  scenic: /view|scenic|lake|sunset|sunrise|landscape/i,
  spiritual: /spiritual|temple|church|mosque|shrine|pray/i,
  foodie: /food|eat|cuisine|dining|restaurant/i,
  adventurous: /adventur|hike|trek|thrill|explore/i,
  family: /family|kids|children|parents|grand/i,
  shopping: /shop|market|bazaar|craft|souvenir/i,
  nightlife: /nightlife|bar|club|party/i,
  nature: /nature|garden|park|wildlife|forest|beach/i,
  photography: /photo|instagram|picture/i,
  luxury: /luxur|premium|five.?star|splurge/i,
  budget: /budget|cheap|affordable|save money/i,
};

export function vibesFromMood(mood: string): VibeTag[] {
  const tags = VibeTag.options.filter((t) => MOOD_KEYWORDS[t].test(mood));
  return (tags.length > 0 ? tags : ["cultural", "scenic"]).slice(0, 4) as VibeTag[];
}

export interface MoodResult {
  vibes: VibeTag[];
  rankedIds: string[];
  summary: string;
  fallback: boolean;
}

export async function runMoodMatcher(run: AgentRun, req: TripRequest, places: readonly Place[]): Promise<MoodResult> {
  run.emit({ type: "thinking", agent: "mood_matcher", text: `Reading the mood: "${short(req.mood || "no mood given", 160)}"` });
  const ids = new Set(places.map((p) => p.id));
  const brief = {
    mood: req.mood || "(none given)",
    travelers: req.travelers,
    pace: req.pace,
    stepFreeRequired: req.accessibility.stepFreeRequired,
    allowedVibeTags: VibeTag.options,
    places: places.slice(0, 40).map((p) => ({ id: p.id, name: p.name, category: p.category, vibes: p.vibes })),
  };
  const out = await llmJson(run, {
    agent: "mood_matcher",
    role: "fast",
    system: MOOD_SYSTEM,
    user: JSON.stringify(brief),
    schema: MoodProfile,
    schemaName: "MoodProfile",
  });
  if (out) {
    const ranked = [...new Set(out.data.rankedPlaceIds.map(normalizeId))].filter((id) => ids.has(id));
    const avoid = new Set(out.data.avoidCategories);
    const rest = defaultRanking(places, out.data.vibeTags).filter((id) => !ranked.includes(id));
    const all = [...ranked, ...rest];
    const isAvoided = (id: string) => avoid.has(places.find((p) => p.id === id)?.category ?? "heritage");
    const ordered = [...all.filter((id) => !isAvoided(id)), ...all.filter(isAvoided)];
    const vibes = out.data.vibeTags.length > 0 ? out.data.vibeTags : vibesFromMood(req.mood);
    run.emit({ type: "thinking", agent: "mood_matcher", text: `${out.data.summary} Vibes: ${vibes.join(", ")}.`.slice(0, 600) });
    return { vibes, rankedIds: ordered, summary: out.data.summary, fallback: false };
  }
  const vibes = vibesFromMood(req.mood);
  run.emit({ type: "thinking", agent: "mood_matcher", text: `Model unavailable; ranked places by keyword match (${vibes.join(", ")}).` });
  return { vibes, rankedIds: defaultRanking(places, vibes), summary: "", fallback: true };
}

/* ---------------- Explorer ---------------- */

export function defaultExplorePlan(req: TripRequest): ExplorePlan {
  const vibes = vibesFromMood(req.mood);
  const cats = new Set<PlaceCategory>(["heritage", "viewpoint"]);
  if (vibes.includes("cultural")) cats.add("museum");
  if (vibes.includes("calm") || vibes.includes("nature")) cats.add("garden");
  if (vibes.includes("romantic") || vibes.includes("scenic")) cats.add("waterfront");
  if (vibes.includes("spiritual")) cats.add("religious");
  if (vibes.includes("shopping") || vibes.includes("foodie")) cats.add("market");
  const radiusKm = req.pace === "relaxed" ? 6 : req.pace === "balanced" ? 10 : 15;
  return { categories: [...cats].slice(0, 6), radiusKm, note: "Default search plan" };
}

// Named constants for explorer query bounds and place limits to avoid magic numbers
const MAX_FALLBACK_QUERY_LIMIT = "25"; // fetch up to 25 attractions from Nominatim fallback
const MAX_EXPLORER_PACK_PLACES = 10; // keep up to 10 explorer places if curated city pack already exists
const MAX_EXPLORER_UNCURATED_PLACES = 40; // keep up to 40 explorer places when no curated pack exists
const NOMINATIM_CACHE_TTL_MS = 7 * 24 * 3_600_000; // 7 days cache TTL in milliseconds for geocoding data
const SANITIZE_NAME_MAX_LEN = 120; // max length for place name text sanitization

// Helper mapping OpenStreetMap Nominatim item types to PlaceCategory
function nomCategory(type?: string): PlaceCategory {
  if (!type) return "heritage"; // fallback when type is missing
  if (type === "museum" || type === "gallery") return "museum"; // categorize museums and galleries
  if (type === "viewpoint") return "viewpoint"; // categorize scenic viewpoints
  if (type === "garden" || type === "park") return "garden"; // categorize parks and gardens
  if (type === "place_of_worship") return "religious"; // categorize religious temples and shrines
  if (type === "marketplace") return "market"; // categorize markets
  if (type === "castle" || type === "palace" || type === "monument" || type === "fort") return "heritage"; // categorize historic sites
  if (type === "theme_park" || type === "zoo" || type === "aquarium") return "experience"; // categorize entertainment experiences
  if (type === "theatre") return "show"; // categorize performance venues
  if (type === "beach" || type === "water") return "waterfront"; // categorize water bodies and beaches
  return "heritage"; // default category fallback for unclassified attractions
}

export async function runExplorer(run: AgentRun, req: TripRequest, center: LatLon, pack: CityPack | null): Promise<{ places: Place[] }> {
  const out = await llmJson(run, {
    agent: "explorer",
    role: "fast",
    system: EXPLORER_SYSTEM,
    user: JSON.stringify({
      destination: req.destination,
      mood: req.mood,
      pace: req.pace,
      travelers: req.travelers,
      stepFreeRequired: req.accessibility.stepFreeRequired,
      allowedCategories: PlaceCategory.options,
      curatedPlaces: pack?.places.length ?? 0,
    }),
    schema: ExplorePlan,
    schemaName: "ExplorePlan",
  });
  const plan = out?.data ?? defaultExplorePlan(req);
  run.emit({ type: "thinking", agent: "explorer", text: `Searching OpenStreetMap for ${plan.categories.join(", ")} within ${plan.radiusKm} km. ${plan.note}`.slice(0, 600) });
  let found =
    (await withTool(run, "explorer", "overpass.query", { categories: plan.categories.join(","), radiusKm: plan.radiusKm, lat: center.lat, lon: center.lon }, () =>
      run.deps.tools.findPlaces(center, plan.categories, plan.radiusKm, run.signal),
    )) ?? [];
  // Deterministic fallback: if Overpass servers fail or return zero places for an uncurated city, query Nominatim for attractions
  if (found.length === 0 && !pack) {
    const nomPlaces = await withTool(
      run,
      "explorer",
      "nominatim.search",
      { query: `attractions in ${req.destination}` },
      async () => {
        const queryParams = new URLSearchParams({ q: `attractions in ${req.destination}`, format: "jsonv2", limit: MAX_FALLBACK_QUERY_LIMIT }); // construct search query parameters
        const url = `https://nominatim.openstreetmap.org/search?${queryParams.toString()}`; // build target URL
        const r = await fetchJson({
          label: "nominatim", // label for fetch logging and circuit breaker
          url, // target Nominatim search URL
          headers: { "user-agent": userAgent(run.deps.config), "accept-language": "en" }, // headers with descriptive user agent
          schema: NominatimResult, // validate response against NominatimResult schema
          timeoutMs: TIMEOUTS.nominatimMs, // enforce standard nominatim timeout limit
          signal: run.signal, // pass run abort signal
          cacheKey: `nom_attr:${req.destination.trim().toLowerCase()}`, // cache key per destination
          cacheTtlMs: NOMINATIM_CACHE_TTL_MS, // cache TTL duration
        });
        const fallbackList: Place[] = []; // accumulator for extracted places
        const seenNames = new Set<string>(); // set to avoid duplicate place names
        for (const item of r.data) {
          const rawName = item.name || item.display_name.split(",")[0] || ""; // extract first segment of place name
          const cleanName = sanitizeExternalText(rawName, SANITIZE_NAME_MAX_LEN); // sanitize untrusted external text
          if (!cleanName || seenNames.has(cleanName.toLowerCase()) || detectInjection(cleanName).length > 0) continue; // skip invalid or injected names
          seenNames.add(cleanName.toLowerCase()); // record name as seen
          const cat = nomCategory(item.type); // classify place category from Nominatim type
          fallbackList.push({
            id: `osm:n${item.place_id}`, // assign unique OSM place id
            name: cleanName, // assign sanitized place name
            category: cat, // assign mapped category
            location: { lat: item.lat, lon: item.lon }, // assign coordinates
            visitMin: DEFAULT_VISIT_MIN[cat], // assign default visit duration
            ticketPerPerson: null, // cost is estimated/unspecified
            hours: null, // unknown opening hours
            stepFree: "unverified", // mark accessibility status as unverified
            outdoor: OUTDOOR_CATEGORY[cat], // set indoor/outdoor flag based on category
            vibes: CATEGORY_VIBES[cat] ?? ["cultural"], // assign default vibe tags
            source: "osm", // provenance source
            osmRef: `node/${item.place_id}`, // OSM node reference
          });
        }
        return {
          value: fallbackList, // return extracted places array
          cached: r.cached, // record whether result was cached
          summary: `${fallbackList.length} attraction(s) found via Nominatim for ${req.destination}`, // summary message
        };
      },
    );
    if (nomPlaces && nomPlaces.length > 0) {
      found = nomPlaces; // use Nominatim places if available
    }
  }
  return { places: pack ? found.slice(0, MAX_EXPLORER_PACK_PLACES) : found.slice(0, MAX_EXPLORER_UNCURATED_PLACES) };
}

export async function runRouteMatrix(run: AgentRun, points: ReadonlyArray<{ id: string; location: LatLon }>): Promise<TravelMatrix | null> {
  if (points.length < 2) return null;
  return withTool(run, "explorer", "osrm.table", { points: points.length }, () => run.deps.tools.routeMatrix(points, run.signal));
}

/* ---------------- ConditionsScout ---------------- */

const KIND_PATTERNS: ReadonlyArray<readonly [Advisory["kind"], RegExp]> = [
  ["closure", /\b(closed|closure|shut|renovation|restricted entry)\b/i],
  ["event", /\b(festival|fair|concert|celebration|mela|parade|exhibition)\b/i],
  ["advisory", /\b(advisory|warning|alert|protest|strike|curfew|flood|heatwave|storm)\b/i],
];

function keywordTriage(hits: readonly WebHit[], places: readonly Place[], destination: string): ConditionsTriage["items"] {
  const dest = destination.toLowerCase();
  return hits.map((h) => {
    const text = `${h.title} ${h.content}`;
    const kind = KIND_PATTERNS.find(([, re]) => re.test(text))?.[0] ?? "other";
    const lower = text.toLowerCase();
    const affects = places.filter((p) => p.name.length >= 5 && lower.includes(p.name.toLowerCase())).map((p) => p.id).slice(0, 5);
    return { resultId: h.id, relevant: kind !== "other" && lower.includes(dest), kind, affectsPlaceIds: affects };
  });
}

function monthYear(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export async function runConditionsScout(
  run: AgentRun,
  req: TripRequest,
  center: LatLon,
  placesP: Promise<readonly Place[]>,
): Promise<{ weather: DayWeather[]; advisories: Advisory[] }> {
  const weather =
    (await withTool(run, "conditions_scout", "open_meteo.forecast", { lat: center.lat, lon: center.lon, start: req.startDate, end: req.endDate }, () =>
      run.deps.tools.forecast(center, req.startDate, req.endDate, run.signal),
    )) ?? [];

  const hits: WebHit[] = [];
  if (run.deps.config.tavilyApiKey) {
    const when = monthYear(req.startDate);
    const queries = [
      { query: `${req.destination} festivals and events ${when}`, topic: "general" as const },
      { query: `${req.destination} tourist attraction closed OR closure OR advisory ${when}`, topic: "news" as const, timeRange: "month" as const },
    ];
    for (const q of queries) {
      if (!run.budget.canSpendTavily(1)) break;
      const r = await withTool(run, "conditions_scout", "tavily.search", { query: q.query, topic: q.topic }, () =>
        run.deps.tools.webSearch({ ...q, maxResults: 5 }, run.signal),
      );
      for (const h of r ?? []) if (!hits.some((x) => x.url === h.url)) hits.push(h);
    }
  } else {
    run.emit({ type: "thinking", agent: "conditions_scout", text: "Tavily is not configured; skipping live events and closures." });
  }
  const numbered = hits.slice(0, 8).map((h, i) => ({ ...h, id: `W${i + 1}` }));
  const clean = numbered.filter((h) => detectInjection(`${h.title} ${h.content}`).length === 0);
  if (clean.length < numbered.length) {
    run.emit({ type: "thinking", agent: "conditions_scout", text: `Ignored ${numbered.length - clean.length} web result(s) that looked like prompt injection.` });
  }
  if (clean.length === 0) return { weather, advisories: [] };

  const places = await placesP;
  const placeIds = new Set(places.map((p) => p.id));
  const brief = [
    `TRIP: ${req.destination}, ${req.startDate} to ${req.endDate}`,
    `PLACES: ${JSON.stringify(places.slice(0, 30).map((p) => ({ id: p.id, name: p.name })))}`,
    "RESULTS:",
    ...clean.map((h) => wrapUntrusted(h.id, "tavily", h.url, `${h.title}\n${h.content}`, 700)),
  ].join("\n");
  const out = await llmJson(run, {
    agent: "conditions_scout",
    role: "fast",
    system: TRIAGE_SYSTEM,
    user: brief,
    schema: ConditionsTriage,
    schemaName: "ConditionsTriage",
    temperature: 0.2,
  });
  const items = out?.data.items ?? keywordTriage(clean, places, req.destination);
  const byId = new Map(clean.map((h) => [h.id, h] as const));
  const advisories: Advisory[] = [];
  for (const t of items) {
    const h = byId.get(t.resultId.trim());
    if (!h || !t.relevant || advisories.some((a) => a.id === h.id)) continue;
    const adv: Advisory = {
      id: h.id,
      kind: t.kind,
      title: h.title,
      url: h.url,
      snippet: h.content.slice(0, 400),
      affectsPlaceIds: t.affectsPlaceIds.map(normalizeId).filter((id) => placeIds.has(id)).slice(0, 5),
      verified: false,
    };
    if (h.publishedDate) adv.publishedDate = h.publishedDate;
    advisories.push(adv);
  }
  run.emit({
    type: "thinking",
    agent: "conditions_scout",
    text: advisories.length > 0 ? `Found ${advisories.length} relevant note(s): ${advisories.map((a) => `${a.kind}: ${short(a.title, 60)}`).join("; ")}`.slice(0, 600) : "No closures or events that affect this trip.",
  });
  return { weather, advisories };
}

/* ---------------- BudgetKeeper ---------------- */

export interface BudgetHints {
  budgetMinor: number;
  currency: TripRequest["budget"]["currency"];
  days: number;
  nights: number;
  rooms: number;
  lodgingStay: Partial<Record<Tier, number>>;
  mealsTotal: Record<Tier, number>;
  arrivalMinor: number;
}

export function budgetHints(req: TripRequest, pack: CityPack | null, center: LatLon, fx: FxTable): BudgetHints {
  const days = Math.max(1, dayCount(req.startDate, req.endDate));
  const nights = Math.max(0, days - 1);
  const rooms = Math.ceil(req.travelers / 2);
  const cur = req.budget.currency;
  const lodging = (pack?.lodging ?? estimateLodging(center)).filter((l) => !(req.accessibility.stepFreeRequired && l.stepFree === "not_step_free"));
  const lodgingStay: Partial<Record<Tier, number>> = {};
  for (const l of lodging) {
    const stay = convertMinor(mulMinor(mulMinor(l.nightlyPerRoom.amountMinor, rooms), nights), l.nightlyPerRoom.currency, cur, fx);
    const prev = lodgingStay[l.tier];
    if (prev === undefined || stay < prev) lodgingStay[l.tier] = stay;
  }
  const meals = pack?.mealsPerPersonPerDay ?? estimateMeals();
  const mealsTotal = Object.fromEntries(
    TIER_ORDER.map((t) => [t, convertMinor(mulMinor(mulMinor(meals[t].amountMinor, req.travelers), days), meals[t].currency, cur, fx)]),
  ) as Record<Tier, number>;
  const originKey = req.origin.trim().toLowerCase();
  const arrival = pack?.arrivals.find((a) => originKey.startsWith(a.fromCity.toLowerCase()))?.roundTripPerPerson;
  const arrivalMinor = arrival ? convertMinor(mulMinor(arrival.amountMinor, req.travelers), arrival.currency, cur, fx) : 0;
  return { budgetMinor: req.budget.amountMinor, currency: cur, days, nights, rooms, lodgingStay, mealsTotal, arrivalMinor };
}

export function deterministicStrategy(h: BudgetHints): BudgetStrategy {
  const available = Math.max(0, h.budgetMinor - h.arrivalMinor);
  const lodgingTier = [...TIER_ORDER].reverse().find((t) => (h.lodgingStay[t] ?? Infinity) <= available * 0.45) ?? "budget";
  const mealTier = [...TIER_ORDER].reverse().find((t) => h.mealsTotal[t] <= available * 0.25) ?? "budget";
  const pct = (n: number) => (h.budgetMinor === 0 ? 0 : Math.round((n * 100) / h.budgetMinor));
  const lodging = pct(h.lodgingStay[lodgingTier] ?? 0);
  const food = pct(h.mealsTotal[mealTier]);
  const transport = Math.min(100, pct(h.arrivalMinor) + 3);
  const activities = Math.max(0, 100 - lodging - food - transport - 5);
  return {
    lodgingTier,
    mealTier,
    splitPct: { lodging, food, activities, transport, buffer: Math.max(0, 100 - lodging - food - transport - activities) },
    rationale: "Rule-based split that keeps lodging under 45% and meals under 25% of the budget.",
  };
}

export async function runBudgetKeeper(run: AgentRun, h: BudgetHints, mood: string): Promise<BudgetStrategy> {
  const f = (n: number) => formatMoney(n, h.currency);
  const brief = {
    budget: `${f(h.budgetMinor)} total`,
    trip: { days: h.days, nights: h.nights, rooms: h.rooms, occasion: mood.slice(0, 200) },
    fixedCosts: h.arrivalMinor > 0 ? { gettingThere: f(h.arrivalMinor) } : {},
    lodgingStayByTier: Object.fromEntries(Object.entries(h.lodgingStay).map(([t, v]) => [t, f(v)])),
    mealsByTier: Object.fromEntries(TIER_ORDER.map((t) => [t, f(h.mealsTotal[t])])),
  };
  const out = await llmJson(run, {
    agent: "budget_keeper",
    role: "fast",
    system: BUDGET_SYSTEM,
    user: JSON.stringify(brief),
    schema: BudgetStrategy,
    schemaName: "BudgetStrategy",
  });
  let s = out?.data ?? deterministicStrategy(h);
  const sum = Object.values(s.splitPct).reduce((a, b) => a + b, 0);
  if (sum !== 100 && sum > 0) {
    const k = 100 / sum;
    const lodging = Math.round(s.splitPct.lodging * k);
    const food = Math.round(s.splitPct.food * k);
    const activities = Math.round(s.splitPct.activities * k);
    const transport = Math.round(s.splitPct.transport * k);
    s = { ...s, splitPct: { lodging, food, activities, transport, buffer: Math.max(0, 100 - lodging - food - activities - transport) } };
  }
  if (h.lodgingStay[s.lodgingTier] === undefined) s = { ...s, lodgingTier: deterministicStrategy(h).lodgingTier };
  run.emit({
    type: "thinking",
    agent: "budget_keeper",
    text: `Strategy: ${s.lodgingTier} stay, ${s.mealTier} meals; split ${s.splitPct.lodging}% stay / ${s.splitPct.food}% food / ${s.splitPct.activities}% activities / ${s.splitPct.transport}% transport / ${s.splitPct.buffer}% buffer. ${s.rationale}`.slice(0, 600),
  });
  return s;
}
