/**
 * Deterministic scheduler: ordered place ids -> timed day with transit legs, lunch, rests and costs.
 * The LLM chooses order; this code computes every time, distance and price.
 */
import type {
  DayPlan,
  ItineraryItem,
  LatLon,
  Lodging,
  Place,
  PricedAmount,
  TravelMatrix,
} from "../../types/travelverse.js";
import type { PlanningContext } from "./context.js";
import { convertMinor, convertPriced, mulMinor, priced, scaleMinor } from "./money.js";
import {
  ESTIMATES,
  EVENING_OPEN_MIN,
  LUNCH_LATEST_MIN,
  LUNCH_MIN,
  LUNCH_START_MIN,
  ON_SITE_WALK_KM,
  PICKUP_BUFFER_MIN,
  TAXI_DETOUR,
  TAXI_SPEED_KMH,
  WAIT_AS_REST_MIN,
  WALK_DETOUR,
  WALK_THRESHOLD_KM,
  WALK_THRESHOLD_STEP_FREE_KM,
} from "./profiles.js";
import { haversineKm, hoursLabel, minToHhmm, openWindow, round2 } from "./time.js";

export interface Leg {
  mode: "walk" | "taxi";
  distanceKm: number;
  durationMin: number;
  source: "osrm" | "derived";
}

interface Point {
  id: string;
  location: LatLon;
}

const matrixIndexCache = new WeakMap<TravelMatrix, Map<string, number>>();

function matrixLookup(m: TravelMatrix | null, a: string, b: string): { distanceM: number; durationSec: number } | null {
  if (!m) return null;
  let idx = matrixIndexCache.get(m);
  if (!idx) {
    idx = new Map(m.ids.map((id, i) => [id, i] as const));
    matrixIndexCache.set(m, idx);
  }
  const i = idx.get(a);
  const j = idx.get(b);
  if (i === undefined || j === undefined) return null;
  const d = m.distancesM[i]?.[j];
  const t = m.durationsSec[i]?.[j];
  if (d === null || d === undefined || t === null || t === undefined) return null;
  return { distanceM: d, durationSec: t };
}

export function legBetween(from: Point, to: Point, ctx: PlanningContext): Leg {
  const crow = haversineKm(from.location, to.location);
  const walkLimit = ctx.request.accessibility.stepFreeRequired ? WALK_THRESHOLD_STEP_FREE_KM : WALK_THRESHOLD_KM;
  if (crow <= walkLimit) {
    const km = round2(crow * WALK_DETOUR);
    return { mode: "walk", distanceKm: km, durationMin: Math.max(1, Math.ceil((km / ctx.profile.walkSpeedKmh) * 60)), source: "derived" };
  }
  const m = matrixLookup(ctx.matrix, from.id, to.id);
  if (m) {
    return {
      mode: "taxi",
      distanceKm: round2(m.distanceM / 1000),
      durationMin: Math.ceil(m.durationSec / 60) + PICKUP_BUFFER_MIN,
      source: "osrm",
    };
  }
  const km = round2(crow * TAXI_DETOUR);
  return { mode: "taxi", distanceKm: km, durationMin: Math.ceil((km / TAXI_SPEED_KMH) * 60) + PICKUP_BUFFER_MIN, source: "derived" };
}

/** Ticket for the whole party in the source currency; "estimate" provenance when the price is unknown. */
export function ticketOriginal(place: Place, ctx: PlanningContext): PricedAmount {
  const t = place.ticketPerPerson;
  if (t) return { ...t, amountMinor: mulMinor(t.amountMinor, ctx.request.travelers) };
  return priced(mulMinor(ESTIMATES.ticketPerPerson[place.category], ctx.request.travelers), ESTIMATES.currency, "estimate", {
    note: `Estimated ${place.category} ticket`,
  });
}

/** Fare for one leg for the whole party (vehicles = ceil(travelers / seats)). Walking is free. */
export function legCostOriginal(leg: Leg, ctx: PlanningContext): PricedAmount {
  const { baseFare, perKm, seatsPerVehicle } = ctx.transport;
  if (leg.mode === "walk") return priced(0, baseFare.currency, "derived", { note: "Walking" });
  const perKmInBase = convertMinor(perKm.amountMinor, perKm.currency, baseFare.currency, ctx.fx);
  const oneVehicle = baseFare.amountMinor + scaleMinor(perKmInBase, leg.distanceKm);
  const vehicles = Math.ceil(ctx.request.travelers / seatsPerVehicle);
  return priced(mulMinor(oneVehicle, vehicles), baseFare.currency, perKm.provenance, {
    note: `${leg.distanceKm} km by taxi (${leg.source === "osrm" ? "OSRM road distance" : "straight-line x1.3"}), ${vehicles} vehicle(s)`,
    ...(perKm.sourceUrl ? { sourceUrl: perKm.sourceUrl } : {}),
  });
}

export function scheduleDay(
  day: { dayIndex: number; theme: string; placeIds: readonly string[] },
  lodging: Lodging,
  ctx: PlanningContext,
): DayPlan {
  const date = ctx.dates[day.dayIndex];
  if (date === undefined) throw new Error(`Day index ${day.dayIndex} outside the trip`);
  const p = ctx.profile;
  const items: ItineraryItem[] = [];
  let t = p.dayStartMin;
  let seq = 0;
  const nextId = () => `d${day.dayIndex}-${seq++}`;
  let prev: Point = { id: lodging.id, location: lodging.location };
  let lunchDone = false;
  let visitsSinceRest = 0;
  let blockStart = t;
  let longestBlock = 0;
  let walkKm = 0;
  let transitMin = 0;
  let visits = 0;

  const closeBlock = () => {
    longestBlock = Math.max(longestBlock, t - blockStart);
  };
  const addLunch = () => {
    closeBlock();
    items.push({ kind: "meal", id: nextId(), start: minToHhmm(t), end: minToHhmm(t + LUNCH_MIN), label: "Lunch" });
    t += LUNCH_MIN;
    lunchDone = true;
    blockStart = t;
    visitsSinceRest = 0;
  };
  const addRest = (min: number, reason: string) => {
    closeBlock();
    items.push({ kind: "rest", id: nextId(), start: minToHhmm(t), end: minToHhmm(t + min), reason: reason.slice(0, 80) });
    t += min;
    blockStart = t;
    visitsSinceRest = 0;
  };
  const addTransit = (to: Point) => {
    const leg = legBetween(prev, to, ctx);
    const original = legCostOriginal(leg, ctx);
    items.push({
      kind: "transit",
      id: nextId(),
      start: minToHhmm(t),
      end: minToHhmm(t + leg.durationMin),
      fromId: prev.id,
      toId: to.id,
      mode: leg.mode,
      distanceKm: leg.distanceKm,
      durationMin: leg.durationMin,
      cost: convertPriced(original, ctx.currency, ctx.fx),
      costOriginal: original,
    });
    t += leg.durationMin;
    transitMin += leg.durationMin;
    if (leg.mode === "walk") walkKm += leg.distanceKm;
    prev = to;
  };

  const lunchDue = () => !lunchDone && t >= LUNCH_START_MIN && t <= LUNCH_LATEST_MIN;
  // Keep the planner's order, but evening-only places (open >= 15:00) always go last (stable sort).
  const isEvening = (id: string): number => {
    const w = openWindow(ctx.places.get(id)?.hours ?? null, date);
    return typeof w === "object" && w.openMin >= EVENING_OPEN_MIN ? 1 : 0;
  };
  const ordered = [...day.placeIds].sort((a, b) => isEvening(a) - isEvening(b));

  ordered.forEach((placeId, idx) => {
    const place = ctx.places.get(placeId);
    if (!place) return;
    if (lunchDue()) addLunch();
    addTransit({ id: place.id, location: place.location });
    const win = openWindow(place.hours, date);
    if (typeof win === "object" && t < win.openMin) {
      const wait = win.openMin - t;
      if (wait >= WAIT_AS_REST_MIN) addRest(wait, `Waiting for ${place.name} to open`);
      else t = win.openMin;
    }
    const ticket = ticketOriginal(place, ctx);
    items.push({
      kind: "visit",
      id: nextId(),
      start: minToHhmm(t),
      end: minToHhmm(t + place.visitMin),
      placeId: place.id,
      name: place.name,
      category: place.category,
      location: place.location,
      cost: convertPriced(ticket, ctx.currency, ctx.fx),
      costOriginal: ticket,
      stepFree: place.stepFree,
      evidence: [...(ctx.evidence.get(place.id) ?? [])].slice(0, 3),
      outdoor: place.outdoor,
      hoursLabel: hoursLabel(place.hours),
    });
    t += place.visitMin;
    visits += 1;
    visitsSinceRest += 1;
    walkKm += place.onSiteWalkKm ?? ON_SITE_WALK_KM[place.category];
    const isLast = idx === ordered.length - 1;
    if (!isLast && !lunchDue() && p.restEveryVisits > 0 && visitsSinceRest >= p.restEveryVisits) addRest(p.restMin, "Rest break");
  });

  if (visits > 0) {
    if (lunchDue()) addLunch();
    addTransit({ id: lodging.id, location: lodging.location });
  }
  closeBlock();

  return {
    dayIndex: day.dayIndex,
    date,
    theme: day.theme.slice(0, 60),
    weather: ctx.weather.get(date) ?? null,
    items,
    metrics: {
      visits,
      walkKm: round2(walkKm),
      transitMin,
      startMin: p.dayStartMin,
      endMin: t,
      longestActiveBlockMin: longestBlock,
    },
  };
}
