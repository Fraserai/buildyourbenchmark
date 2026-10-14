import { sha256 } from "../ids";
import { ProviderError, type ExecuteRequest, type ExecuteResult, type InferenceProvider } from "./types";

/**
 * Demo provider — SIMULATED. Calls no model. Output, timing and token counts are
 * synthetic and every result produced here is stored with mode=demo and
 * cost_source=simulated so it can never be mistaken for a measurement.
 */
export class DemoProvider implements InferenceProvider {
  readonly id = "demo";
  readonly name = "Demo (simulated)";
  readonly simulated = true;

  constructor(private readonly speedFactor = Number(process.env.DEMO_SPEED_FACTOR ?? 1)) {}

  isConfigured() {
    return true;
  }

  async execute(req: ExecuteRequest): Promise<ExecuteResult> {
    const seed = parseInt(sha256(`${req.modelId}:${JSON.stringify(req.params)}`).slice(0, 8), 16);
    const rand = mulberry32(seed ^ Date.now());

    const textChars = req.payload.user.reduce((n, p) => n + (p.type === "text" ? p.text.length : 0), 0) + (req.payload.system?.length ?? 0);
    const images = req.payload.user.filter((p) => p.type === "image").length;
    const inputTokens = Math.ceil(textChars / 4) + images * 1100;

    const effort = String(req.params.reasoningEffort ?? "");
    const reasoningTokens = effort === "max" ? 2500 + Math.round(rand() * 6000) : effort === "xhigh" ? 1500 + Math.round(rand() * 3000) : effort === "high" ? 600 + Math.round(rand() * 1500) : 0;

    const text = [
      `> **Simulated output — demo mode.** No model was called. This placeholder stands in for ${req.modelId} so you can try the workflow without inference cost.`,
      "",
      "In a live run this model receives exactly the payload recorded on this run.",
      "",
      "| Payload | |",
      "|---|---|",
      `| System instructions | ${req.payload.system ? `${req.payload.system.length.toLocaleString()} characters` : "none"} |`,
      `| Input parts | ${req.payload.user.length} (${images} image${images === 1 ? "" : "s"}) |`,
      `| Max output tokens | ${req.payload.maxOutputTokens.toLocaleString()} |`,
      "",
      "Switch the run mode to **Live** once a provider key is configured to measure the real price, time and output.",
    ].join("\n");
    const outputTokens = Math.min(Math.ceil(text.length / 4) + 180 + Math.round(rand() * 900) + reasoningTokens, req.payload.maxOutputTokens);

    // Synthetic pacing only, so the progress UI can be exercised. Never shown as a measurement.
    const latencyMs = Math.round(Math.min(600 + rand() * 900 + outputTokens * (0.25 + rand() * 0.9), 12_000) * this.speedFactor);
    await sleep(latencyMs, req.signal);

    return {
      text,
      usage: {
        inputTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens,
        reasoningTokens: Math.min(reasoningTokens, outputTokens),
      },
      providerCostUsd: null,
      providerRequestId: `demo_${seed.toString(16)}`,
      servedBy: `${req.modelId} (simulated)`,
      finishReason: "stop",
      timeToFirstTokenMs: Math.round(latencyMs * 0.3),
      meta: { simulated: true },
    };
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new ProviderError("Request aborted", "aborted", false));
    });
  });
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
