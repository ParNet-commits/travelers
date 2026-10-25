/** Open-Meteo daily forecast (no key). Only the next 16 days exist; outside that window we report "not available". */
import { OpenMeteoResponse, type DayWeather, type LatLon } from "../../types/travelverse.js";
import { TIMEOUTS } from "../config.js";
import { addDays } from "../engine/time.js";
import { fetchJson } from "../http/fetchJson.js";
import type { ToolOut } from "./types.js";

export function wmoLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code >= 1 && code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Unknown";
}

export async function forecast(center: LatLon, startDate: string, endDate: string, today: string, signal: AbortSignal): Promise<ToolOut<DayWeather[]>> {
  const last = addDays(today, 15);
  const s = startDate < today ? today : startDate;
  const e = endDate > last ? last : endDate;
  if (s > e) return { value: [], cached: false, summary: "Forecast not available yet (Open-Meteo covers the next 16 days)" };
  const params = new URLSearchParams({
    latitude: center.lat.toFixed(4),
    longitude: center.lon.toFixed(4),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    start_date: s,
    end_date: e,
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const r = await fetchJson({ label: "open-meteo", url, schema: OpenMeteoResponse, timeoutMs: TIMEOUTS.openMeteoMs, signal, cacheKey: url, cacheTtlMs: 3 * 3_600_000 });
  const d = r.data.daily;
  const days: DayWeather[] = d.time.map((date, i) => {
    const code = Math.round(d.weather_code[i] ?? -1);
    const rain = d.precipitation_probability_max?.[i];
    return {
      date,
      weatherCode: code,
      label: wmoLabel(code),
      tMaxC: d.temperature_2m_max[i] ?? null,
      tMinC: d.temperature_2m_min[i] ?? null,
      rainProbPct: rain === undefined || rain === null ? null : Math.min(100, Math.max(0, Math.round(rain))),
    };
  });
  const partial = s !== startDate || e !== endDate ? " (partial: outside the 16-day window)" : "";
  return {
    value: days,
    cached: r.cached,
    summary: `${days.map((x) => `${x.date.slice(5)} ${x.label} ${x.rainProbPct ?? "?"}%`).join(", ")}${partial}`.slice(0, 300),
  };
}
