/** Demo presets shared by the UI ("Try Riya's trip") and the golden recorder. Isomorphic. */
import type { TripRequest } from "../types/travelverse.js";

function plusDays(base: Date, n: number): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + n));
  return d.toISOString().slice(0, 10);
}

/** Starts 10 days from today so the 16-day weather forecast covers the whole trip. */
export function riyaPreset(today: Date = new Date()): TripRequest {
  return {
    origin: "Mumbai",
    destination: "Udaipur",
    startDate: plusDays(today, 10),
    endDate: plusDays(today, 13),
    travelers: 2,
    budget: { amountMinor: 90_000, currency: "USD" },
    pace: "relaxed",
    mood: "My parents' 30th wedding anniversary. Romantic, calm, lakeside, a little royal. Dad cannot manage stairs.",
    accessibility: { stepFreeRequired: true, maxWalkKmPerDay: 2, notes: "Father cannot climb stairs; short walks only." },
  };
}

export const PRESETS = {
  riya: { label: "Riya's gift: parents' 30th anniversary in Udaipur", build: riyaPreset },
} as const;
