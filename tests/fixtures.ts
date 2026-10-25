/** Synthetic test city ("Testville"). Numbers are invented for tests only - never shown to users. */
import type { CityPack, FxTable, PricedAmount, TripRequest } from "../types/travelverse.js";
import type { PlanningContext } from "../server/engine/context.js";
import { buildPlanningContext } from "../server/orchestrator/context.js";

export const FX: FxTable = {
  base: "USD",
  asOf: "2026-10-15",
  source: "Test fixture",
  perUsd: { USD: "1", EUR: "0.9", GBP: "0.8", INR: "88" },
};

const SRC = "https://example.org/testville";
const inr = (amountMinor: number): PricedAmount => ({ amountMinor, currency: "INR", provenance: "curated_table", sourceUrl: SRC, asOf: "2026-10-01" });
const daily = (open: string, close: string) => ({ rules: [{ days: [0, 1, 2, 3, 4, 5, 6], open, close }] });

export const TESTVILLE: CityPack = {
  id: "testville",
  name: "Testville",
  aliases: ["test ville"],
  country: "IN",
  currency: "INR",
  center: { lat: 24.58, lon: 73.69 },
  timezone: "Asia/Kolkata",
  places: [
    { id: "testville:palace", name: "Hill Palace", category: "heritage", location: { lat: 24.5764, lon: 73.6835 }, visitMin: 150, ticketPerPerson: inr(80000), hours: daily("09:30", "17:30"), stepFree: "not_step_free", stepFreeNote: "Many steep staircases inside the palace.", stepFreeSourceUrl: SRC, outdoor: false, vibes: ["cultural", "romantic"], source: "curated" },
    { id: "testville:lake-boat", name: "Lake Boat Ride", category: "waterfront", location: { lat: 24.572, lon: 73.68 }, visitMin: 60, ticketPerPerson: inr(50000), hours: daily("10:00", "18:00"), stepFree: "partial", outdoor: true, vibes: ["romantic", "scenic", "calm"], source: "curated" },
    { id: "testville:garden", name: "Queens Garden", category: "garden", location: { lat: 24.596, lon: 73.686 }, visitMin: 60, ticketPerPerson: inr(5000), hours: daily("09:00", "19:00"), stepFree: "step_free", stepFreeSourceUrl: SRC, outdoor: true, vibes: ["calm", "nature", "romantic"], source: "curated" },
    { id: "testville:museum", name: "Craft Museum", category: "museum", location: { lat: 24.579, lon: 73.687 }, visitMin: 90, ticketPerPerson: inr(10000), hours: { rules: [{ days: [0, 2, 3, 4, 5, 6], open: "10:00", close: "17:00" }] }, stepFree: "step_free", stepFreeSourceUrl: SRC, outdoor: false, vibes: ["cultural"], source: "curated" },
    { id: "testville:temple", name: "Old Temple", category: "religious", location: { lat: 24.5795, lon: 73.684 }, visitMin: 30, ticketPerPerson: inr(0), hours: daily("06:00", "21:00"), stepFree: "not_step_free", stepFreeNote: "32 steps at the entrance.", outdoor: false, vibes: ["spiritual"], source: "curated" },
    { id: "testville:sunset", name: "Sunset Point", category: "viewpoint", location: { lat: 24.585, lon: 73.66 }, visitMin: 45, ticketPerPerson: inr(20000), hours: daily("09:00", "20:00"), stepFree: "step_free", stepFreeSourceUrl: SRC, outdoor: true, vibes: ["romantic", "scenic", "photography"], source: "curated" },
    { id: "testville:fort", name: "Monsoon Fort", category: "heritage", location: { lat: 24.593, lon: 73.64 }, visitMin: 120, ticketPerPerson: inr(30000), hours: daily("08:00", "18:00"), stepFree: "not_step_free", outdoor: true, vibes: ["scenic", "adventurous"], source: "curated" },
    { id: "testville:dance", name: "Evening Dance Show", category: "show", location: { lat: 24.58, lon: 73.683 }, visitMin: 60, ticketPerPerson: inr(30000), hours: daily("18:45", "20:00"), stepFree: "step_free", outdoor: false, vibes: ["cultural", "romantic"], source: "curated" },
    { id: "testville:market", name: "Bazaar Street", category: "market", location: { lat: 24.578, lon: 73.685 }, visitMin: 60, ticketPerPerson: inr(0), hours: daily("10:00", "21:00"), stepFree: "partial", outdoor: true, vibes: ["shopping", "foodie"], source: "curated" },
    { id: "testville:car-museum", name: "Vintage Car Museum", category: "museum", location: { lat: 24.588, lon: 73.695 }, visitMin: 60, ticketPerPerson: inr(40000), hours: daily("09:00", "21:00"), stepFree: "step_free", outdoor: false, vibes: ["family"], source: "curated" },
  ],
  lodging: [
    { id: "testville:hotel-premium", name: "Lake Palace Hotel", tier: "premium", location: { lat: 24.5755, lon: 73.68 }, nightlyPerRoom: inr(3500000), stepFree: "partial" },
    { id: "testville:hotel-mid", name: "Garden View Hotel", tier: "mid", location: { lat: 24.585, lon: 73.69 }, nightlyPerRoom: inr(800000), stepFree: "step_free", stepFreeSourceUrl: SRC },
    { id: "testville:hotel-budget", name: "Old City Guesthouse", tier: "budget", location: { lat: 24.579, lon: 73.683 }, nightlyPerRoom: inr(250000), stepFree: "not_step_free" },
  ],
  mealsPerPersonPerDay: { budget: inr(80000), mid: inr(200000), premium: inr(500000) },
  localTransport: { baseFare: inr(5000), perKm: inr(2500), seatsPerVehicle: 4 },
  arrivals: [{ fromCity: "Mumbai", mode: "flight", roundTripPerPerson: inr(1200000) }],
  officialDomains: ["example.org"],
};

/** Monday 2026-11-16 .. Thursday 2026-11-19 (4 days, 3 nights). */
export function riyaLikeRequest(overrides: Partial<TripRequest> = {}): TripRequest {
  return {
    origin: "Mumbai",
    destination: "Testville",
    startDate: "2026-11-16",
    endDate: "2026-11-19",
    travelers: 2,
    budget: { amountMinor: 90000, currency: "USD" },
    pace: "relaxed",
    mood: "30th anniversary, romantic and calm, my father cannot manage stairs",
    accessibility: { stepFreeRequired: true, maxWalkKmPerDay: 3, notes: "Father cannot manage stairs" },
    ...overrides,
  };
}

export function testContext(request: TripRequest = riyaLikeRequest()): PlanningContext {
  return buildPlanningContext({
    runId: "run_test",
    request,
    destinationName: "Testville",
    center: TESTVILLE.center,
    pack: TESTVILLE,
    osmPlaces: [],
    matrix: null,
    weather: [],
    advisories: [],
    extraEvidence: [],
    rankedIds: [],
    vibes: ["romantic", "calm"],
    fx: FX,
    today: "2026-10-17",
  });
}
