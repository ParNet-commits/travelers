/**
 * Curated city packs. Add a city: create <city>.ts exporting a CityPack, import it here, run `npm run check:data`.
 * Cities without a pack still work through OpenStreetMap + the estimate table (shown with "Estimated" badges).
 */
import { CityPack } from "../../../types/travelverse.js";
import type { CityPack as CityPackT } from "../../../types/travelverse.js";

// import { UDAIPUR } from "./udaipur.js";   <- add after the H4 data prompt creates it

const RAW_PACKS: readonly unknown[] = [
  // UDAIPUR,
];

function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let parsed: CityPackT[] | null = null;

/** Validates every pack once; invalid packs throw at startup instead of producing silent wrong numbers. */
export function allCityPacks(): CityPackT[] {
  if (parsed) return parsed;
  parsed = RAW_PACKS.map((raw, i) => {
    const r = CityPack.safeParse(raw);
    if (!r.success) {
      const first = r.error.issues[0];
      throw new Error(`City pack #${i} invalid at ${first?.path.join(".") ?? "?"}: ${first?.message ?? "unknown"}`);
    }
    return r.data;
  });
  return parsed;
}

/** "Udaipur", "udaipur, rajasthan", "Udaipur India" -> the Udaipur pack. */
export function findCityPack(destination: string, packs: readonly CityPackT[] = allCityPacks()): CityPackT | null {
  const q = normalizeName(destination);
  for (const p of packs) {
    const names = [p.name, ...p.aliases].map(normalizeName);
    if (names.some((n) => q === n || q.startsWith(`${n} `) || q.endsWith(` ${n}`) || q.includes(` ${n} `))) return p;
  }
  return null;
}
