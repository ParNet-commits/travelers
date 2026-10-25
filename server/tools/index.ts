import type { AppConfig } from "../config.js";
import { findPlaces, geocode, routeMatrix } from "./osm.js";
import { extract, webSearch } from "./tavily.js";
import type { ToolSuite } from "./types.js";
import { forecast } from "./weather.js";

/** Real tool implementations bound to config. `today` is injectable so tests and replays are deterministic. */
export function createToolSuite(cfg: AppConfig, today: () => string = () => new Date().toISOString().slice(0, 10)): ToolSuite {
  return {
    geocode: (query, signal) => geocode(cfg, query, signal),
    findPlaces: (center, categories, radiusKm, signal) => findPlaces(cfg, center, categories, radiusKm, signal),
    routeMatrix: (points, signal) => routeMatrix(cfg, points, signal),
    forecast: (center, startDate, endDate, signal) => forecast(center, startDate, endDate, today(), signal),
    webSearch: (args, signal) => webSearch(cfg, args, signal),
    extract: (args, signal) => extract(cfg, args, signal),
  };
}
