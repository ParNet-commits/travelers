/**
 * FX table: units of each currency per 1 USD. Update before recording the demo (npm run check:data warns after 30 days).
 * Values: Pound Sterling Live daily closes, 15-16 Oct 2026 (USD/INR 94.7510, USD/EUR 0.8920, USD/GBP 0.7533).
 */
import type { FxTable } from "../../types/travelverse.js";

export const FX_TABLE: FxTable = {
  base: "USD",
  asOf: "2026-10-16",
  source: "Pound Sterling Live daily close",
  sourceUrl: "https://www.poundsterlinglive.com/history/USD-INR-2026",
  perUsd: { USD: "1", EUR: "0.8920", GBP: "0.7533", INR: "94.7510" },
};
