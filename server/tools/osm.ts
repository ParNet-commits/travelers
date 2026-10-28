/** OpenStreetMap tools: Nominatim (geocode), Overpass (places), OSRM (road matrix). All through fetchJson. */
import { createHash } from "node:crypto";
import {
  NominatimResult,
  OsrmTableResponse,
  OverpassResponse,
  type LatLon,
  type Place,
  type PlaceCategory,
  type StepFreeStatus,
  type TravelMatrix,
  type VibeTag,
} from "../../types/travelverse.js";
import { TIMEOUTS, type AppConfig } from "../config.js";
import { DEFAULT_VISIT_MIN, OUTDOOR_CATEGORY } from "../engine/profiles.js";
import { haversineKm, parseOsmOpeningHours } from "../engine/time.js";
import { AppError, toAppError } from "../errors.js";
import { fetchJson, hostKey } from "../http/fetchJson.js";
import { detectInjection, safeUrl, sanitizeExternalText } from "../security/untrusted.js";
import type { ToolOut } from "./types.js";

export function userAgent(cfg: AppConfig): string {
  return `TravelVerse/0.1 (hackathon demo; contact: ${cfg.contactEmail ?? "unset"})`;
}

export async function geocode(cfg: AppConfig, query: string, signal: AbortSignal): Promise<ToolOut<{ name: string; center: LatLon } | null>> {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: "jsonv2", limit: "1" }).toString()}`;
  const r = await fetchJson({
    label: "nominatim",
    url,
    headers: { "user-agent": userAgent(cfg), "accept-language": "en" },
    schema: NominatimResult,
    timeoutMs: TIMEOUTS.nominatimMs,
    signal,
    cacheKey: `geo:${query.trim().toLowerCase()}`,
    cacheTtlMs: 7 * 24 * 3_600_000,
  });
  const first = r.data[0];
  if (!first) return { value: null, cached: r.cached, summary: `No match for "${query.slice(0, 60)}"` };
  const name = sanitizeExternalText(first.name || first.display_name.split(",")[0] || query, 80);
  return { value: { name, center: { lat: first.lat, lon: first.lon } }, cached: r.cached, summary: `Found ${sanitizeExternalText(first.display_name, 120)}` };
}

// List of public Overpass API interpreter endpoints used in round-robin or fallback order
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter", // main public Overpass instance
  "https://overpass.private.coffee/api/interpreter", // active reliable public Overpass mirror (replaces decommissioned kumi.systems)
] as const;

const FILTERS: Readonly<Record<PlaceCategory, readonly string[]>> = {
  heritage: ['nwr["historic"~"^(castle|fort|palace|monument|ruins|archaeological_site|city_gate)$"]["name"]', 'nwr["tourism"="attraction"]["historic"]["name"]'],
  museum: ['nwr["tourism"~"^(museum|gallery)$"]["name"]'],
  viewpoint: ['nwr["tourism"="viewpoint"]["name"]'],
  garden: ['nwr["leisure"~"^(garden|park)$"]["name"]["wikidata"]'],
  market: ['nwr["amenity"="marketplace"]["name"]'],
  religious: ['nwr["amenity"="place_of_worship"]["name"]["wikidata"]'],
  waterfront: ['nwr["natural"~"^(beach|water)$"]["name"]["wikidata"]', 'nwr["man_made"="pier"]["name"]', 'nwr["leisure"="marina"]["name"]'],
  nature: ['nwr["leisure"="nature_reserve"]["name"]', 'nwr["boundary"="national_park"]["name"]'],
  experience: ['nwr["tourism"~"^(theme_park|zoo|aquarium)$"]["name"]'],
  show: ['nwr["amenity"="theatre"]["name"]'],
};

// Exported category-to-vibe mapping used for tagging places found via OSM and fallback search
export const CATEGORY_VIBES: Readonly<Record<PlaceCategory, VibeTag[]>> = {
  heritage: ["cultural", "photography"],
  museum: ["cultural", "family"],
  viewpoint: ["scenic", "romantic", "photography"],
  garden: ["calm", "nature", "romantic"],
  market: ["shopping", "foodie"],
  religious: ["spiritual", "cultural"],
  waterfront: ["scenic", "calm", "romantic"],
  nature: ["nature", "adventurous"],
  experience: ["family", "adventurous"],
  show: ["cultural", "nightlife"],
};

export function buildOverpassQuery(center: LatLon, categories: readonly PlaceCategory[], radiusKm: number): string {
  const r = Math.round(Math.min(Math.max(radiusKm, 1), 25) * 1000);
  const around = `(around:${r},${center.lat.toFixed(5)},${center.lon.toFixed(5)})`;
  const parts = [...new Set(categories)].flatMap((c) => FILTERS[c].map((f) => `${f}${around};`));
  return `[out:json][timeout:10];(${parts.join("")});out tags center 150;`;
}

function categorize(tags: Record<string, string>): PlaceCategory | null {
  const t = tags.tourism;
  if (t === "museum" || t === "gallery") return "museum";
  if (t === "viewpoint") return "viewpoint";
  if (t === "theme_park" || t === "zoo" || t === "aquarium") return "experience";
  if (tags.amenity === "theatre") return "show";
  if (tags.amenity === "marketplace") return "market";
  if (tags.amenity === "place_of_worship") return "religious";
  if (tags.historic) return "heritage";
  if (tags.leisure === "garden" || tags.leisure === "park") return "garden";
  if (tags.leisure === "nature_reserve" || tags.boundary === "national_park") return "nature";
  if (tags.natural === "beach" || tags.natural === "water" || tags.man_made === "pier" || tags.leisure === "marina") return "waterfront";
  return null;
}

function wheelchair(tag: string | undefined): StepFreeStatus {
  if (tag === "yes") return "step_free";
  if (tag === "limited") return "partial";
  if (tag === "no") return "not_step_free";
  return "unverified";
}

export function elementsToPlaces(elements: OverpassResponse["elements"], center: LatLon, max = 40): Place[] {
  const scored: Array<{ place: Place; score: number; dist: number }> = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const rawName = tags["name:en"] ?? tags.name;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!rawName || lat === undefined || lon === undefined) continue;
    const name = sanitizeExternalText(rawName, 120);
    if (!name || detectInjection(name).length > 0) continue;
    const category = categorize(tags);
    if (!category) continue;
    const website = safeUrl(tags.website ?? tags["contact:website"] ?? "");
    const location = { lat, lon };
    const place: Place = {
      id: `osm:${el.type[0]}${el.id}`,
      name,
      category,
      location,
      visitMin: DEFAULT_VISIT_MIN[category],
      ticketPerPerson: tags.fee === "no" ? { amountMinor: 0, currency: "USD", provenance: "osm", note: "OpenStreetMap fee=no" } : null,
      hours: tags.opening_hours ? parseOsmOpeningHours(tags.opening_hours) : null,
      stepFree: wheelchair(tags.wheelchair),
      outdoor: OUTDOOR_CATEGORY[category],
      vibes: CATEGORY_VIBES[category],
      source: "osm",
      osmRef: `${el.type}/${el.id}`,
    };
    if (website) place.officialUrl = website;
    const score = (tags.wikidata ? 3 : 0) + (tags.wikipedia ? 2 : 0) + (website ? 1 : 0) + (tags.tourism === "attraction" ? 1 : 0);
    scored.push({ place, score, dist: haversineKm(center, location) });
  }
  const byName = new Map<string, { place: Place; score: number; dist: number }>();
  for (const s of scored) {
    const key = s.place.name.toLowerCase();
    const prev = byName.get(key);
    if (!prev || s.score > prev.score) byName.set(key, s);
  }
  return [...byName.values()]
    .sort((a, b) => b.score - a.score || a.dist - b.dist)
    .slice(0, max)
    .map((s) => s.place);
}

export async function findPlaces(
  cfg: AppConfig,
  center: LatLon,
  categories: readonly PlaceCategory[],
  radiusKm: number,
  signal: AbortSignal,
): Promise<ToolOut<Place[]>> {
  const q = buildOverpassQuery(center, categories, radiusKm);
  const key = `ovp:${createHash("sha1").update(q).digest("hex")}`;
  let last: AppError = new AppError("TOOL_UPSTREAM", "overpass: no endpoint answered");
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const r = await fetchJson({
        label: "overpass",
        url: endpoint,
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": userAgent(cfg) },
        body: `data=${encodeURIComponent(q)}`,
        schema: OverpassResponse,
        timeoutMs: TIMEOUTS.overpassMs,
        signal,
        retries: 0,
        cacheKey: key,
        cacheTtlMs: 24 * 3_600_000,
      });
      if (r.data.remark && /runtime error|timed out|out of memory/i.test(r.data.remark)) {
        throw new AppError("TOOL_UPSTREAM", "overpass: server-side timeout");
      }
      const places = elementsToPlaces(r.data.elements, center);
      return { value: places, cached: r.cached, summary: `${places.length} place(s) [${categories.join(", ")}] within ${radiusKm} km via ${hostKey(endpoint)}` };
    } catch (e) {
      const err = toAppError(e, "TOOL_UPSTREAM");
      if (err.code === "ABORTED") throw err;
      last = err;
    }
  }
  throw last;
}

export async function routeMatrix(cfg: AppConfig, points: ReadonlyArray<{ id: string; location: LatLon }>, signal: AbortSignal): Promise<ToolOut<TravelMatrix | null>> {
  const pts = points.slice(0, 30);
  if (pts.length < 2) return { value: null, cached: false, summary: "Not enough points for a matrix" };
  const coords = pts.map((p) => `${p.location.lon.toFixed(5)},${p.location.lat.toFixed(5)}`).join(";");
  const r = await fetchJson({
    label: "osrm",
    url: `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`,
    headers: { "user-agent": userAgent(cfg) },
    schema: OsrmTableResponse,
    timeoutMs: TIMEOUTS.osrmMs,
    signal,
    cacheKey: `osrm:${coords}`,
    cacheTtlMs: 24 * 3_600_000,
  });
  if (r.data.code !== "Ok" || !r.data.durations || !r.data.distances) {
    throw new AppError("TOOL_BAD_RESPONSE", `osrm: ${r.data.code} ${r.data.message ?? ""}`.trim());
  }
  return {
    value: { ids: pts.map((p) => p.id), durationsSec: r.data.durations, distancesM: r.data.distances },
    cached: r.cached,
    summary: `${pts.length}x${pts.length} road distance matrix`,
  };
}
