import { describe, expect, it } from "vitest";
import { calculateTaskCost, decimalToNano, perTokenToPerMTok, usdToNano } from "@/server/pricing/cost";

describe("cost engine", () => {
  it("converts per-token prices to exact per-million decimals", () => {
    expect(perTokenToPerMTok("0.000004")).toBe("4");
    expect(perTokenToPerMTok("0.0000002442")).toBe("0.2442");
    expect(perTokenToPerMTok("0.000000035")).toBe("0.035");
    expect(perTokenToPerMTok("0")).toBe("0");
    expect(() => perTokenToPerMTok("-1")).toThrow();
    expect(() => perTokenToPerMTok("1e-6")).toThrow();
  });

  it("parses decimals into integer nano-USD", () => {
    expect(decimalToNano("4")).toBe(4_000_000_000n);
    expect(decimalToNano("0.075")).toBe(75_000_000n);
    expect(decimalToNano("0.0000000015")).toBe(2n); // rounds half up past nano precision
  });

  it("calculates the documented example exactly", () => {
    const r = calculateTaskCost(
      { inputTokens: 12341, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1242, reasoningTokens: 0 },
      { currency: "USD", inputPerMTok: "4", outputPerMTok: "20", cacheReadPerMTok: "0.2", cacheWritePerMTok: "5" },
    );
    // 12,341 × $4/M + 1,242 × $20/M = $0.049364 + $0.02484
    expect(r.totalNanoUsd).toBe(74_204_000);
    expect(r.breakdown.segmentsNanoUsd.input).toBe(49_364_000);
    expect(r.breakdown.segmentsNanoUsd.answer).toBe(24_840_000);
  });

  it("splits reasoning from answer and prices caches separately", () => {
    const r = calculateTaskCost(
      { inputTokens: 1000, cacheReadTokens: 10000, cacheWriteTokens: 2000, outputTokens: 3000, reasoningTokens: 2000 },
      { currency: "USD", inputPerMTok: "2", outputPerMTok: "10", cacheReadPerMTok: "0.2", cacheWritePerMTok: "2.5" },
    );
    expect(r.breakdown.segmentsNanoUsd).toEqual({ input: 2_000_000, cacheRead: 2_000_000, cacheWrite: 5_000_000, reasoning: 20_000_000, answer: 10_000_000 });
    expect(r.totalNanoUsd).toBe(39_000_000);
  });

  it("falls back to input rate for missing cache rates and says so", () => {
    const r = calculateTaskCost(
      { inputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 },
      { currency: "USD", inputPerMTok: "1.5", outputPerMTok: "7.5", cacheReadPerMTok: null, cacheWritePerMTok: null },
    );
    expect(r.totalNanoUsd).toBe(1_500_000_000);
    expect(r.breakdown.rateNotes.length).toBe(1);
  });

  it("rejects impossible usage", () => {
    const rates = { currency: "USD", inputPerMTok: "1", outputPerMTok: "1", cacheReadPerMTok: null, cacheWritePerMTok: null };
    expect(() => calculateTaskCost({ inputTokens: -1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 }, rates)).toThrow();
    expect(() => calculateTaskCost({ inputTokens: 1.5, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 }, rates)).toThrow();
    expect(() => calculateTaskCost({ inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 10, reasoningTokens: 11 }, rates)).toThrow();
  });

  it("is deterministic", () => {
    const usage = { inputTokens: 98765, cacheReadTokens: 4321, cacheWriteTokens: 0, outputTokens: 5555, reasoningTokens: 1234 };
    const rates = { currency: "USD", inputPerMTok: "0.2442", outputPerMTok: "0.7326", cacheReadPerMTok: "0.00777", cacheWritePerMTok: null };
    expect(calculateTaskCost(usage, rates)).toEqual(calculateTaskCost(usage, rates));
  });

  it("converts provider USD to nano", () => {
    expect(usdToNano(0.074204)).toBe(74_204_000);
    expect(() => usdToNano(NaN)).toThrow();
  });
});
