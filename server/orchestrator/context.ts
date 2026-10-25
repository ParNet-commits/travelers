/** Builds the PlanningContext from curated data + agent/tool outputs. Pure (no I/O). */
import type {
  Advisory,
  CityPack,
  DayWeather,
  Evidence,
  FxTable,
  LatLon,
  Lodging,
  Place,
  PricedAmount,
  StepFreeStatus,
  Tier,
  TravelMatrix,
  TripRequest,
  VibeTag,
} from "../../types/travelverse.js";
import type { PlanningContext } from "../engine/context.js";
import { priced } from "../engine/money.js";
import { ESTIMATES, PACE_PROFILES } from "../engine/profiles.js";
import { datesBetween, haversineKm } from "../engine/time.js";

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isOfficialDomain(url: string, officialDomains: readonly string[]): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (/\.(gov|gov\.in|nic\.in|gouv\.fr|gob\.es|go\.jp|gov\.uk)$/.test(host)) return true;
  return officialDomains.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Conservative merge: any verified "not step-free" wins; step-free needs positive evidence and no negatives. */
export function mergeStepFree(base: StepFreeStatus, evidence: readonly Evidence[]): StepFreeStatus {
  const statuses = [base, ...evidence.filter((e) => e.verbatimVerified || e.method !== "tavily_extract").map((e) => e.status)];
  if (statuses.includes("not_step_free")) return "not_step_free";
  if (statuses.includes("partial")) return "partial";
  if (statuses.includes("step_free")) return "step_free";
  return "unverified";
}

export function estimateLodging(center: LatLon): Lodging[] {
  const tiers: Tier[] = ["budget", "mid", "premium"];
  const label: Record<Tier, string> = { budget: "Budget stay (estimate)", mid: "Mid-range hotel (estimate)", premium: "Premium hotel (estimate)" };
  return tiers.map((t) => ({
    id: `est:lodging-${t}`,
    name: label[t],
    tier: t,
    location: center,
    nightlyPerRoom: priced(ESTIMATES.lodgingNightlyPerRoom[t], ESTIMATES.currency, "estimate", { note: "Typical nightly rate; book to confirm" }),
    stepFree: "unverified",
  }));
}

export function estimateMeals(): Record<Tier, PricedAmount> {
  const m = (t: Tier) => priced(ESTIMATES.mealsPerPersonPerDay[t], ESTIMATES.currency, "estimate", { note: `Typical ${t} meals per person per day` });
  return { budget: m("budget"), mid: m("mid"), premium: m("premium") };
}

function curatedEvidence(pack: CityPack, today: string): Evidence[] {
  const out: Evidence[] = [];
  const add = (id: string, status: StepFreeStatus, url: string | undefined, note: string | undefined) => {
    if (!url) return;
    const e: Evidence = {
      targetId: id,
      status,
      method: "curated",
      url,
      domain: hostOf(url),
      verbatimVerified: false,
      official: isOfficialDomain(url, pack.officialDomains),
      retrievedAt: today,
    };
    if (note) e.quote = note.slice(0, 400);
    out.push(e);
  };
  for (const p of pack.places) add(p.id, p.stepFree, p.stepFreeSourceUrl, p.stepFreeNote);
  for (const l of pack.lodging) add(l.id, l.stepFree, l.stepFreeSourceUrl, l.stepFreeNote);
  return out;
}

function osmEvidence(places: readonly Place[], today: string): Evidence[] {
  return places
    .filter((p) => p.source === "osm" && p.osmRef && p.stepFree !== "unverified")
    .map((p) => ({
      targetId: p.id,
      status: p.stepFree,
      method: "osm_tag" as const,
      url: `https://www.openstreetmap.org/${p.osmRef ?? ""}`,
      domain: "openstreetmap.org",
      quote: `OpenStreetMap wheelchair tag: ${p.stepFree === "step_free" ? "yes" : p.stepFree === "partial" ? "limited" : "no"}`,
      verbatimVerified: false,
      official: false,
      retrievedAt: today,
    }));
}

/** Keyword/vibe ranking used when MoodMatcher is unavailable, and to complete partial LLM rankings. */
export function defaultRanking(places: readonly Place[], vibes: readonly VibeTag[]): string[] {
  const score = (p: Place) =>
    p.vibes.filter((v) => vibes.includes(v)).length * 10 + (p.source === "curated" ? 3 : 0) + (p.ticketPerPerson ? 1 : 0);
  return [...places].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)).map((p) => p.id);
}

export interface ContextInput {
  runId: string;
  request: TripRequest;
  destinationName: string;
  center: LatLon;
  pack: CityPack | null;
  osmPlaces: readonly Place[];
  matrix: TravelMatrix | null;
  weather: readonly DayWeather[];
  advisories: readonly Advisory[];
  extraEvidence: readonly Evidence[];
  rankedIds: readonly string[];
  vibes: readonly VibeTag[];
  fx: FxTable;
  today: string;
}

export function buildPlanningContext(input: ContextInput): PlanningContext {
  const { request, pack } = input;
  const curated = pack?.places ?? [];
  // OSM extras: skip anything within 150 m of a curated place or with the same name.
  const curatedNames = new Set(curated.map((p) => p.name.toLowerCase()));
  const extras = input.osmPlaces.filter(
    (o) => !curatedNames.has(o.name.toLowerCase()) && !curated.some((c) => haversineKm(c.location, o.location) < 0.15),
  );
  const allPlaces = [...curated, ...extras];

  const evidenceList = [
    ...(pack ? curatedEvidence(pack, input.today) : []),
    ...osmEvidence(extras, input.today),
    ...input.extraEvidence,
  ];
  const evidence = new Map<string, Evidence[]>();
  for (const e of evidenceList) evidence.set(e.targetId, [...(evidence.get(e.targetId) ?? []), e]);

  const places = new Map<string, Place>();
  for (const p of allPlaces) places.set(p.id, { ...p, stepFree: mergeStepFree(p.stepFree, evidence.get(p.id) ?? []) });

  const lodgingList = pack ? pack.lodging : estimateLodging(input.center);
  const lodging = new Map<string, Lodging>();
  for (const l of lodgingList) lodging.set(l.id, { ...l, stepFree: mergeStepFree(l.stepFree, evidence.get(l.id) ?? []) });

  const ranked = input.rankedIds.filter((id) => places.has(id));
  const rest = defaultRanking([...places.values()], input.vibes).filter((id) => !ranked.includes(id));

  const dates = datesBetween(request.startDate, request.endDate);
  const originKey = request.origin.trim().toLowerCase();
  const arrival = pack?.arrivals.find((a) => originKey.startsWith(a.fromCity.toLowerCase()))?.roundTripPerPerson ?? null;

  return {
    runId: input.runId,
    request,
    destinationName: input.destinationName,
    dates,
    nights: Math.max(0, dates.length - 1),
    rooms: Math.ceil(request.travelers / 2),
    currency: request.budget.currency,
    fx: input.fx,
    places,
    rankedPlaceIds: [...ranked, ...rest],
    lodging,
    meals: pack ? pack.mealsPerPersonPerDay : estimateMeals(),
    transport: pack
      ? pack.localTransport
      : {
          baseFare: priced(ESTIMATES.taxiBase, ESTIMATES.currency, "estimate", { note: "Typical taxi flag fare" }),
          perKm: priced(ESTIMATES.taxiPerKm, ESTIMATES.currency, "estimate", { note: "Typical taxi fare per km" }),
          seatsPerVehicle: ESTIMATES.seatsPerVehicle,
        },
    arrival,
    weather: new Map(input.weather.map((w) => [w.date, w] as const)),
    advisories: input.advisories,
    matrix: input.matrix,
    evidence,
    profile: PACE_PROFILES[request.pace],
  };
}
