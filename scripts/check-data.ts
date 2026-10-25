/**
 * Data integrity gate for curated city packs and the FX table (run before every deploy and before recording).
 * Errors (exit 1): schema violations, curated prices without source/date, duplicate ids, no step-free lodging when needed.
 * Warnings: stale prices (> 60 days), stale FX (> 30 days), unknown opening hours, unverified accessibility.
 */
import { allCityPacks } from "../server/data/cities/index.js";
import { FX_TABLE } from "../server/data/fx.js";
import { FxTable, type PricedAmount } from "../types/travelverse.js";

const today = new Date();
const ageDays = (iso: string) => Math.floor((today.getTime() - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);
const errors: string[] = [];
const warnings: string[] = [];

const fx = FxTable.safeParse(FX_TABLE);
if (!fx.success) errors.push(`FX table invalid: ${fx.error.issues[0]?.message ?? "?"}`);
else if (ageDays(fx.data.asOf) > 30) warnings.push(`FX table is ${ageDays(fx.data.asOf)} days old (asOf ${fx.data.asOf}).`);

function checkPrice(where: string, p: PricedAmount | null): void {
  if (!p) return;
  if (p.provenance === "curated_table") {
    if (!p.sourceUrl) errors.push(`${where}: curated price without sourceUrl`);
    if (!p.asOf) errors.push(`${where}: curated price without asOf date`);
    else if (ageDays(p.asOf) > 60) warnings.push(`${where}: price is ${ageDays(p.asOf)} days old`);
  }
}

let packs: ReturnType<typeof allCityPacks> = [];
try {
  packs = allCityPacks();
} catch (e) {
  errors.push(e instanceof Error ? e.message : String(e));
}

for (const pack of packs) {
  const ids = new Set<string>();
  const dup = (id: string) => {
    if (ids.has(id)) errors.push(`${pack.id}: duplicate id ${id}`);
    ids.add(id);
    if (!id.startsWith(`${pack.id}:`)) warnings.push(`${pack.id}: id ${id} should start with "${pack.id}:"`);
  };
  for (const p of pack.places) {
    dup(p.id);
    checkPrice(`${p.id} ticket`, p.ticketPerPerson);
    if (!p.hours) warnings.push(`${p.id}: opening hours unknown (R2 will warn)`);
    if (p.stepFree === "unverified") warnings.push(`${p.id}: step-free status unverified`);
    if (p.stepFree !== "unverified" && !p.stepFreeSourceUrl) warnings.push(`${p.id}: step-free status has no stepFreeSourceUrl`);
  }
  for (const l of pack.lodging) {
    dup(l.id);
    checkPrice(`${l.id} nightly`, l.nightlyPerRoom);
  }
  for (const t of ["budget", "mid", "premium"] as const) checkPrice(`${pack.id} meals.${t}`, pack.mealsPerPersonPerDay[t]);
  checkPrice(`${pack.id} taxi base`, pack.localTransport.baseFare);
  checkPrice(`${pack.id} taxi per km`, pack.localTransport.perKm);
  pack.arrivals.forEach((a, i) => checkPrice(`${pack.id} arrival[${i}]`, a.roundTripPerPerson));
  if (!pack.lodging.some((l) => l.stepFree === "step_free")) errors.push(`${pack.id}: no step_free lodging - the step-free hero story cannot pass`);
  if (pack.places.filter((p) => p.stepFree === "step_free").length < 4) warnings.push(`${pack.id}: fewer than 4 step-free places`);
  if (pack.places.length < 10) warnings.push(`${pack.id}: only ${pack.places.length} places (10+ recommended)`);
  console.log(`${pack.id}: ${pack.places.length} places, ${pack.lodging.length} stays, ${pack.officialDomains.length} official domains`);
}
if (packs.length === 0) warnings.push("No curated city packs registered (server/data/cities/index.ts).");

for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(`check:data -> ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length > 0 ? 1 : 0);
