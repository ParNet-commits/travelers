import type { DayWeather, LatLon, Place, PlaceCategory, TravelMatrix } from "../../types/travelverse.js";

/** Every tool returns a value plus what the timeline shows (summary, cache hit, Tavily credits used). */
export interface ToolOut<T> {
  value: T;
  cached: boolean;
  summary: string;
  credits?: number;
}

export interface WebHit {
  id: string;
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
}

export interface ExtractedPage {
  url: string;
  text: string;
}

/** Injected into agents so tests and golden recordings can swap real APIs for fakes. */
export interface ToolSuite {
  geocode(query: string, signal: AbortSignal): Promise<ToolOut<{ name: string; center: LatLon } | null>>;
  findPlaces(center: LatLon, categories: readonly PlaceCategory[], radiusKm: number, signal: AbortSignal): Promise<ToolOut<Place[]>>;
  routeMatrix(points: ReadonlyArray<{ id: string; location: LatLon }>, signal: AbortSignal): Promise<ToolOut<TravelMatrix | null>>;
  forecast(center: LatLon, startDate: string, endDate: string, signal: AbortSignal): Promise<ToolOut<DayWeather[]>>;
  webSearch(
    args: { query: string; topic: "general" | "news"; timeRange?: "day" | "week" | "month" | "year"; maxResults: number; includeDomains?: string[] },
    signal: AbortSignal,
  ): Promise<ToolOut<WebHit[]>>;
  extract(args: { urls: string[]; query: string }, signal: AbortSignal): Promise<ToolOut<{ pages: ExtractedPage[]; failed: Array<{ url: string; error: string }> }>>;
}
