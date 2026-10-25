/** Calendar, clock and opening-hours helpers. Dates are calendar dates (UTC math, no time zones). */
import type { LatLon, OpeningHours } from "../../types/travelverse.js";

export function hhmmToMin(s: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`Bad HH:MM: ${s}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minToHhmm(min: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

export function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 31; d = addDays(d, 1)) out.push(d);
  return out;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export function weekdayName(isoDate: string): string {
  return WD[weekdayOf(isoDate)] ?? "?";
}

export type OpenWindow = { openMin: number; closeMin: number } | "closed" | "unknown";

/** Opening window for a date. Multiple matching rules are merged (earliest open, latest close). */
export function openWindow(hours: OpeningHours | null, isoDate: string): OpenWindow {
  if (!hours) return "unknown";
  if (hours.closedDates?.includes(isoDate)) return "closed";
  const wd = weekdayOf(isoDate);
  let open = Infinity;
  let close = -Infinity;
  for (const r of hours.rules) {
    if (!r.days.includes(wd)) continue;
    const o = hhmmToMin(r.open);
    let c = hhmmToMin(r.close);
    if (c <= o) c = 1440; // closes at/after midnight
    open = Math.min(open, o);
    close = Math.max(close, c);
  }
  return Number.isFinite(open) ? { openMin: open, closeMin: close } : "closed";
}

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Compact human label, e.g. "Daily 09:30-17:30" or "Tue-Sun 10:00-17:00". */
export function hoursLabel(hours: OpeningHours | null): string {
  if (!hours) return "Hours unverified";
  const parts = hours.rules.map((r) => {
    const days = [...new Set(r.days)].sort((a, b) => a - b);
    let dayText: string;
    if (days.length === 7) dayText = "Daily";
    else if (days.length === 6) {
      const missing = [0, 1, 2, 3, 4, 5, 6].find((d) => !days.includes(d)) ?? 0;
      dayText = `Closed ${DAY_LABEL[missing] ?? "?"}`;
    } else dayText = days.map((d) => DAY_LABEL[d] ?? "?").join(",");
    return `${dayText} ${r.open}-${r.close}`;
  });
  return parts.join("; ").slice(0, 60);
}

const OSM_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
function osmDayIndex(d: string): number {
  return OSM_DAYS.indexOf(d as (typeof OSM_DAYS)[number]);
}
/** OSM index (Mo=0) -> JS weekday (Su=0). */
function toJsWeekday(i: number): number {
  return (i + 1) % 7;
}

function expandDaySpec(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const range = part.split("-");
    if (range.length === 1) {
      const i = osmDayIndex(range[0] ?? "");
      if (i < 0) return null;
      out.add(toJsWeekday(i));
    } else if (range.length === 2) {
      const a = osmDayIndex(range[0] ?? "");
      const b = osmDayIndex(range[1] ?? "");
      if (a < 0 || b < 0) return null;
      for (let i = a, guard = 0; guard < 7; i = (i + 1) % 7, guard++) {
        out.add(toJsWeekday(i));
        if (i === b) break;
      }
    } else return null;
  }
  return [...out];
}

function normTime(t: string): string | null {
  if (t === "24:00") return "23:59";
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null;
}

/**
 * Minimal parser for common OSM opening_hours values:
 * "24/7", "09:00-17:00", "Mo-Su 09:00-17:30", "Tu-Su 10:00-17:00; Mo off", "Mo-Fr 09:00-12:00,14:00-18:00".
 * Anything else returns null (= unknown; R2 then warns softly instead of guessing).
 */
export function parseOsmOpeningHours(raw: string): OpeningHours | null {
  const s = raw.trim();
  if (s === "24/7") return { rules: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "00:00", close: "23:59" }] };
  const rules: OpeningHours["rules"] = [];
  const off = new Set<number>();
  for (const segRaw of s.split(";")) {
    const seg = segRaw.trim();
    if (seg === "" || /^PH\b/.test(seg)) continue;
    const offMatch = /^([A-Za-z,-]+)\s+(off|closed)$/.exec(seg);
    if (offMatch) {
      const days = expandDaySpec(offMatch[1] ?? "");
      if (!days) return null;
      days.forEach((d) => off.add(d));
      continue;
    }
    const m = /^(?:([A-Za-z,-]+)\s+)?((?:\d{2}:\d{2}-\d{2}:\d{2})(?:,\d{2}:\d{2}-\d{2}:\d{2})*)$/.exec(seg);
    if (!m) return null;
    const days = m[1] ? expandDaySpec(m[1]) : [0, 1, 2, 3, 4, 5, 6];
    if (!days || days.length === 0) return null;
    const ranges = (m[2] ?? "").split(",").map((r) => r.split("-"));
    const opens = ranges.map((r) => normTime(r[0] ?? ""));
    const closes = ranges.map((r) => normTime(r[1] ?? ""));
    if (opens.some((x) => x === null) || closes.some((x) => x === null)) return null;
    const open = (opens as string[]).sort()[0] ?? "00:00";
    const close = (closes as string[]).sort().at(-1) ?? "23:59";
    rules.push({ days, open, close });
  }
  const cleaned = rules
    .map((r) => ({ ...r, days: r.days.filter((d) => !off.has(d)) }))
    .filter((r) => r.days.length > 0)
    .slice(0, 7);
  return cleaned.length > 0 ? { rules: cleaned } : null;
}

/** Great-circle distance in km. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371.0088;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
