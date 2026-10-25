/** The read-only world the engine plans against. Built once per run by the orchestrator. */
import type {
  Advisory,
  CurrencyCode,
  DayWeather,
  Evidence,
  FxTable,
  Lodging,
  Place,
  PricedAmount,
  Tier,
  TravelMatrix,
  TripRequest,
} from "../../types/travelverse.js";
import type { PaceProfile } from "./profiles.js";

export interface PlanningContext {
  runId: string;
  request: TripRequest;
  destinationName: string;
  /** one entry per trip day, YYYY-MM-DD */
  dates: readonly string[];
  nights: number;
  rooms: number;
  /** budget currency; every cost is converted into it */
  currency: CurrencyCode;
  fx: FxTable;
  places: ReadonlyMap<string, Place>;
  /** all candidate place ids, best mood match first */
  rankedPlaceIds: readonly string[];
  lodging: ReadonlyMap<string, Lodging>;
  meals: Readonly<Record<Tier, PricedAmount>>;
  transport: { baseFare: PricedAmount; perKm: PricedAmount; seatsPerVehicle: number };
  /** round trip per person from origin, or null when not priced */
  arrival: PricedAmount | null;
  weather: ReadonlyMap<string, DayWeather>;
  advisories: readonly Advisory[];
  matrix: TravelMatrix | null;
  /** evidence by place or lodging id */
  evidence: ReadonlyMap<string, readonly Evidence[]>;
  profile: PaceProfile;
}

/** The engine's view of a plan: only ids and enums (what an LLM is allowed to decide). */
export interface NormalizedDraft {
  lodgingId: string;
  mealTier: Tier;
  days: Array<{ dayIndex: number; theme: string; placeIds: string[] }>;
}

export function rankOf(ctx: PlanningContext, placeId: string): number {
  const i = ctx.rankedPlaceIds.indexOf(placeId);
  return i < 0 ? ctx.rankedPlaceIds.length + 1 : i;
}

export function cloneDraft(d: NormalizedDraft): NormalizedDraft {
  return { lodgingId: d.lodgingId, mealTier: d.mealTier, days: d.days.map((x) => ({ ...x, placeIds: [...x.placeIds] })) };
}

export function draftPlaceIds(d: NormalizedDraft): string[] {
  return d.days.flatMap((x) => x.placeIds);
}
