/** One live call per external tool. Use after any tool change, and when a provider looks flaky. */
import { getConfig } from "../server/config.js";
import { createToolSuite } from "../server/tools/index.js";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* optional */
}
const cfg = getConfig();
const tools = createToolSuite(cfg);
const signal = AbortSignal.timeout(60_000);
const today = new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function step(name: string, fn: () => Promise<string>): Promise<void> {
  const t0 = Date.now();
  try {
    console.log(`OK   ${name.padEnd(18)} ${String(Date.now() - t0).padStart(5)} ms  ${await fn()}`);
  } catch (e) {
    console.log(`FAIL ${name.padEnd(18)} ${String(Date.now() - t0).padStart(5)} ms  ${e instanceof Error ? e.message : String(e)}`);
  }
}

const center = { lat: 24.5854, lon: 73.7125 };
await step("nominatim", async () => (await tools.geocode("Udaipur, India", signal)).summary);
await step("overpass", async () => {
  const r = await tools.findPlaces(center, ["heritage", "museum", "viewpoint"], 6, signal);
  return `${r.summary}; first: ${r.value.slice(0, 3).map((p) => p.name).join(" | ")}`;
});
await step("osrm", async () => (await tools.routeMatrix([{ id: "a", location: center }, { id: "b", location: { lat: 24.576, lon: 73.683 } }], signal)).summary);
await step("open-meteo", async () => (await tools.forecast(center, today, inDays(3), signal)).summary);
if (cfg.tavilyApiKey) {
  await step("tavily.search", async () => {
    const r = await tools.webSearch({ query: "Udaipur events this month", topic: "general", maxResults: 3 }, signal);
    return `${r.summary}; credits ${r.credits ?? 0}`;
  });
  await step("tavily.extract", async () => {
    const r = await tools.extract({ urls: ["https://en.wikipedia.org/wiki/City_Palace,_Udaipur"], query: "stairs, wheelchair access" }, signal);
    return `${r.summary}; ${r.value.pages[0]?.text.slice(0, 80) ?? ""}`;
  });
} else console.log("SKIP tavily (no TAVILY_API_KEY)");
