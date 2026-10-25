/**
 * Money math. Integer minor units only (cents, paise). FX conversion uses exact BigInt arithmetic.
 * No LLM ever produces a number that reaches these functions.
 */
import type { CurrencyCode, FxTable, PricedAmount, Provenance } from "../../types/travelverse.js";

export const CURRENCY_EXPONENT: Readonly<Record<CurrencyCode, number>> = { USD: 2, EUR: 2, GBP: 2, INR: 2 };

export function assertMinor(n: number): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Invalid minor amount: ${n}`);
}

/** "88.25" -> 88_250_000n (micro units). */
export function toMicro(decimal: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(decimal.trim());
  if (!m) throw new Error(`Invalid decimal rate: ${decimal}`);
  const frac = (m[2] ?? "").padEnd(6, "0");
  return BigInt(m[1] ?? "0") * 1_000_000n + BigInt(frac);
}

function divRoundHalfUp(num: bigint, den: bigint): bigint {
  return (num * 2n + den) / (2n * den);
}

/** Converts an integer minor amount between currencies using the FX table (units per 1 USD). */
export function convertMinor(amountMinor: number, from: CurrencyCode, to: CurrencyCode, fx: FxTable): number {
  assertMinor(amountMinor);
  if (from === to) return amountMinor;
  const rFrom = toMicro(fx.perUsd[from]);
  const rTo = toMicro(fx.perUsd[to]);
  if (rFrom === 0n || rTo === 0n) throw new Error(`FX rate missing for ${from} -> ${to}`);
  const num = BigInt(amountMinor) * rTo * 10n ** BigInt(CURRENCY_EXPONENT[to]);
  const den = rFrom * 10n ** BigInt(CURRENCY_EXPONENT[from]);
  const out = Number(divRoundHalfUp(num, den));
  assertMinor(out);
  return out;
}

export function sumMinor(values: readonly number[]): number {
  let s = 0;
  for (const v of values) {
    assertMinor(v);
    s += v;
  }
  assertMinor(s);
  return s;
}

export function mulMinor(amountMinor: number, qty: number): number {
  assertMinor(amountMinor);
  if (!Number.isSafeInteger(qty) || qty < 0) throw new Error(`Invalid quantity: ${qty}`);
  const out = amountMinor * qty;
  assertMinor(out);
  return out;
}

/** amount x non-negative real factor (e.g. per-km fare x 3.4 km), rounded half-up. */
export function scaleMinor(amountMinor: number, factor: number): number {
  assertMinor(amountMinor);
  if (!Number.isFinite(factor) || factor < 0) throw new Error(`Invalid factor: ${factor}`);
  const out = Math.round(amountMinor * factor);
  assertMinor(out);
  return out;
}

export function ceilToMajor(amountMinor: number, currency: CurrencyCode): number {
  const unit = 10 ** CURRENCY_EXPONENT[currency];
  return Math.ceil(amountMinor / unit) * unit;
}

export function priced(
  amountMinor: number,
  currency: CurrencyCode,
  provenance: Provenance,
  extra: { sourceUrl?: string; asOf?: string; note?: string } = {},
): PricedAmount {
  assertMinor(amountMinor);
  const p: PricedAmount = { amountMinor, currency, provenance };
  if (extra.sourceUrl !== undefined) p.sourceUrl = extra.sourceUrl;
  if (extra.asOf !== undefined) p.asOf = extra.asOf;
  if (extra.note !== undefined) p.note = extra.note.slice(0, 200);
  return p;
}

/** Same amount in another currency; keeps provenance and source, notes the FX date. */
export function convertPriced(p: PricedAmount, to: CurrencyCode, fx: FxTable): PricedAmount {
  if (p.currency === to) return p;
  const out: PricedAmount = { ...p, amountMinor: convertMinor(p.amountMinor, p.currency, to, fx), currency: to };
  out.note = `${p.note ? `${p.note}; ` : ""}converted from ${p.currency} at FX ${fx.asOf}`.slice(0, 200);
  return out;
}

/** Deterministic ASCII formatting used in rule messages and LLM briefs, e.g. "USD 1,240.00". */
export function formatMoney(amountMinor: number, currency: CurrencyCode): string {
  const exp = CURRENCY_EXPONENT[currency];
  const sign = amountMinor < 0 ? "-" : "";
  const major = Math.abs(amountMinor) / 10 ** exp;
  return `${currency} ${sign}${major.toLocaleString("en-US", { minimumFractionDigits: exp, maximumFractionDigits: exp })}`;
}
