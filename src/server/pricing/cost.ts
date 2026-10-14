/**
 * Cost engine.
 *
 * All arithmetic is done in integer nano-USD (1 USD = 1_000_000_000) with BigInt,
 * from decimal-string rates, so the same usage and the same pricing snapshot
 * always produce exactly the same cost. Nothing here reads "current" prices:
 * the caller passes the immutable snapshot that was in force for the run.
 */
import type { CostBreakdown } from "../db/schema";

export const NANO_PER_USD = 1_000_000_000n;

export type PricingRates = {
  currency: string;
  inputPerMTok: string;
  outputPerMTok: string;
  cacheReadPerMTok: string | null;
  cacheWritePerMTok: string | null;
};

/** Normalized token usage. `inputTokens` excludes cache reads and writes; `reasoningTokens` is a subset of `outputTokens`. */
export type NormalizedUsage = {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

/** Parse a non-negative decimal string ("4", "0.075", "1.25e-1" not allowed) into nano-USD. */
export function decimalToNano(value: string): bigint {
  const s = value.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid decimal rate: "${value}"`);
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "000000000").slice(0, 9);
  const remainder = frac.slice(9);
  let nano = BigInt(whole) * NANO_PER_USD + BigInt(fracPadded);
  // Round half-up on anything beyond nano precision.
  if (remainder.length > 0 && Number(remainder[0]) >= 5) nano += 1n;
  return nano;
}

/** Convert an OpenRouter-style per-token USD price ("0.000004") to USD per 1M tokens as an exact decimal string. */
export function perTokenToPerMTok(perToken: string): string {
  const s = perToken.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid per-token price: "${perToken}"`);
  const [whole, frac = ""] = s.split(".");
  const digits = (whole + frac.padEnd(Math.max(frac.length, 6), "0")).replace(/^0+(?=\d)/, "");
  const shift = Math.max(frac.length, 6) - 6; // decimals remaining after multiplying by 1e6
  const padded = digits.padStart(shift + 1, "0");
  const intPart = padded.slice(0, padded.length - shift) || "0";
  const fracPart = shift > 0 ? padded.slice(padded.length - shift).replace(/0+$/, "") : "";
  return fracPart ? `${BigInt(intPart).toString()}.${fracPart}` : BigInt(intPart).toString();
}

function tokensCost(tokens: number, ratePerMTokNano: bigint): bigint {
  if (!Number.isInteger(tokens) || tokens < 0) throw new Error(`Invalid token count: ${tokens}`);
  const numerator = BigInt(tokens) * ratePerMTokNano;
  // Round half-up to the nearest nano-USD.
  return (numerator + 500_000n) / 1_000_000n;
}

export type CostResult = {
  totalNanoUsd: number;
  breakdown: CostBreakdown;
};

/**
 * calculateTaskCost — actual cost of one execution from its recorded usage and
 * the pricing snapshot in force for that run.
 */
export function calculateTaskCost(usage: NormalizedUsage, rates: PricingRates): CostResult {
  const notes: string[] = [];
  const inputRate = decimalToNano(rates.inputPerMTok);
  const outputRate = decimalToNano(rates.outputPerMTok);

  let cacheReadRate = inputRate;
  if (rates.cacheReadPerMTok != null) cacheReadRate = decimalToNano(rates.cacheReadPerMTok);
  else if (usage.cacheReadTokens > 0) notes.push("No published cache-read rate; cache reads priced at the input rate.");

  let cacheWriteRate = inputRate;
  if (rates.cacheWritePerMTok != null) cacheWriteRate = decimalToNano(rates.cacheWritePerMTok);
  else if (usage.cacheWriteTokens > 0) notes.push("No published cache-write rate; cache writes priced at the input rate.");

  if (usage.reasoningTokens > usage.outputTokens) throw new Error("reasoningTokens cannot exceed outputTokens");
  const answerTokens = usage.outputTokens - usage.reasoningTokens;

  const seg = {
    input: tokensCost(usage.inputTokens, inputRate),
    cacheRead: tokensCost(usage.cacheReadTokens, cacheReadRate),
    cacheWrite: tokensCost(usage.cacheWriteTokens, cacheWriteRate),
    reasoning: tokensCost(usage.reasoningTokens, outputRate),
    answer: tokensCost(answerTokens, outputRate),
  };
  const total = seg.input + seg.cacheRead + seg.cacheWrite + seg.reasoning + seg.answer;

  return {
    totalNanoUsd: Number(total),
    breakdown: {
      currency: rates.currency,
      rates: {
        inputPerMTok: rates.inputPerMTok,
        outputPerMTok: rates.outputPerMTok,
        cacheReadPerMTok: rates.cacheReadPerMTok ?? rates.inputPerMTok,
        cacheWritePerMTok: rates.cacheWritePerMTok ?? rates.inputPerMTok,
      },
      rateNotes: notes,
      segmentsNanoUsd: {
        input: Number(seg.input),
        cacheRead: Number(seg.cacheRead),
        cacheWrite: Number(seg.cacheWrite),
        reasoning: Number(seg.reasoning),
        answer: Number(seg.answer),
      },
    },
  };
}

/** Convert a provider-reported USD amount (float from JSON) to nano-USD. */
export function usdToNano(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) throw new Error(`Invalid USD amount: ${usd}`);
  return Math.round(usd * 1e9);
}
