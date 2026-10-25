/** All tunable planning constants in one place. Pure data, no logic. */
import type { Pace, PlaceCategory, Tier } from "../../types/travelverse.js";

export interface PaceProfile {
  dayStartMin: number;
  dayEndMin: number;
  maxVisits: number;
  maxTransitMin: number;
  defaultWalkKm: number;
  restEveryVisits: number;
  restMin: number;
  maxActiveBlockMin: number;
  walkSpeedKmh: number;
}

export const PACE_PROFILES: Readonly<Record<Pace, PaceProfile>> = {
  relaxed: { dayStartMin: 570, dayEndMin: 1140, maxVisits: 3, maxTransitMin: 120, defaultWalkKm: 4, restEveryVisits: 2, restMin: 30, maxActiveBlockMin: 150, walkSpeedKmh: 3 },
  balanced: { dayStartMin: 540, dayEndMin: 1230, maxVisits: 4, maxTransitMin: 180, defaultWalkKm: 7, restEveryVisits: 3, restMin: 30, maxActiveBlockMin: 210, walkSpeedKmh: 4 },
  packed: { dayStartMin: 510, dayEndMin: 1290, maxVisits: 6, maxTransitMin: 240, defaultWalkKm: 10, restEveryVisits: 0, restMin: 0, maxActiveBlockMin: 300, walkSpeedKmh: 4.5 },
};

export const LUNCH_START_MIN = 750; // 12:30
export const LUNCH_LATEST_MIN = 930; // 15:30 - no lunch item after this
export const LUNCH_MIN = 60;
/** Places that open at or after 15:00 (evening shows, night markets) are scheduled last in their day. */
export const EVENING_OPEN_MIN = 900;
export const WAIT_AS_REST_MIN = 15;
export const WALK_THRESHOLD_KM = 0.8;
export const WALK_THRESHOLD_STEP_FREE_KM = 0.4;
export const WALK_DETOUR = 1.2;
export const TAXI_DETOUR = 1.3;
export const TAXI_SPEED_KMH = 18;
export const PICKUP_BUFFER_MIN = 5;
export const RAIN_SOFT_PCT = 60;
export const HEAT_SOFT_C = 40;
export const TIGHT_BUDGET_BPS = 300; // < 3% left -> soft warning

export const ON_SITE_WALK_KM: Readonly<Record<PlaceCategory, number>> = {
  heritage: 1.2,
  museum: 0.8,
  viewpoint: 0.3,
  garden: 1.0,
  market: 0.8,
  religious: 0.3,
  waterfront: 0.6,
  nature: 2.0,
  experience: 0.5,
  show: 0.1,
};

export const DEFAULT_VISIT_MIN: Readonly<Record<PlaceCategory, number>> = {
  heritage: 120,
  museum: 90,
  viewpoint: 30,
  garden: 60,
  market: 60,
  religious: 30,
  waterfront: 45,
  nature: 120,
  experience: 120,
  show: 90,
};

export const OUTDOOR_CATEGORY: Readonly<Record<PlaceCategory, boolean>> = {
  heritage: true,
  museum: false,
  viewpoint: true,
  garden: true,
  market: true,
  religious: false,
  waterfront: true,
  nature: true,
  experience: false,
  show: false,
};

/**
 * Rough global defaults (USD minor units) for cities without curated data.
 * Always labelled provenance "estimate" and shown with an "Estimated" badge. Tune freely.
 */
export const ESTIMATES = {
  currency: "USD",
  ticketPerPerson: { heritage: 1200, museum: 1500, viewpoint: 0, garden: 500, market: 0, religious: 0, waterfront: 0, nature: 500, experience: 2500, show: 2000 } as Readonly<Record<PlaceCategory, number>>,
  lodgingNightlyPerRoom: { budget: 6000, mid: 14000, premium: 35000 } as Readonly<Record<Tier, number>>,
  mealsPerPersonPerDay: { budget: 2500, mid: 5000, premium: 11000 } as Readonly<Record<Tier, number>>,
  taxiBase: 300,
  taxiPerKm: 120,
  seatsPerVehicle: 4,
} as const;

export const TIER_ORDER: readonly Tier[] = ["budget", "mid", "premium"];
