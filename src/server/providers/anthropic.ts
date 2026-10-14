import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, isRetryableStatus, type ExecuteRequest, type ExecuteResult, type InferenceProvider } from "./types";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS = new Set<Effort>(["low", "medium", "high", "xhigh", "max"]);

/**
 * Direct Anthropic Messages API adapter (official SDK, streamed).
 * Anthropic responses carry token usage but not a billed amount, so cost for this
 * route is always calculated from usage × the run's pricing snapshot.
 */
export class AnthropicProvider implements InferenceProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic API";
  readonly simulated = false;
  private client: Anthropic | null = null;

  constructor(private readonly apiKey: string | undefined = process.env.ANTHROPIC_API_KEY) {}

  isConfigured() {
    return Boolean(this.apiKey);
  }

  private getClient(): Anthropic {
    if (!this.apiKey) throw new ProviderError("ANTHROPIC_API_KEY is not configured", "provider_not_configured", false);
    // The SDK retries are disabled: the executor owns retries so attempts are recorded.
    this.client ??= new Anthropic({ apiKey: this.apiKey, maxRetries: 0, timeout: 30 * 60 * 1000 });
    return this.client;
  }

  async execute(req: ExecuteRequest): Promise<ExecuteResult> {
    const client = this.getClient();
    const content: Anthropic.Beta.BetaContentBlockParam[] = req.payload.user.map((p) =>
      p.type === "text"
        ? { type: "text", text: p.text }
        : {
            type: "image",
            source: { type: "base64", media_type: p.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: p.dataBase64 },
          },
    );
    const effort = typeof req.params.reasoningEffort === "string" && EFFORTS.has(req.params.reasoningEffort as Effort) ? (req.params.reasoningEffort as Effort) : undefined;
    const useFallback = req.params.fallback === "default";

    const started = performance.now();
    let ttft: number | null = null;
    try {
      const stream = client.beta.messages.stream(
        {
          model: req.providerModelId,
          max_tokens: req.payload.maxOutputTokens,
          ...(req.payload.system ? { system: req.payload.system } : {}),
          messages: [{ role: "user", content }],
          ...(effort ? { output_config: { effort } } : {}),
          ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        },
        { signal: req.signal },
      );
      stream.on("text", () => {
        if (ttft === null) ttft = Math.round(performance.now() - started);
      });
      const message = await stream.finalMessage();

      const text = message.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const usage = message.usage;
      const thinking = (usage as unknown as { output_tokens_details?: { thinking_tokens?: number } | null }).output_tokens_details?.thinking_tokens;
      const fallbackRan = (usage.iterations ?? []).some((i) => (i as { type?: string }).type === "fallback_message");

      return {
        text,
        usage: {
          inputTokens: usage.input_tokens,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
          outputTokens: usage.output_tokens,
          reasoningTokens: Math.min(thinking ?? 0, usage.output_tokens),
        },
        providerCostUsd: null,
        providerRequestId: message.id,
        servedBy: message.model,
        finishReason: message.stop_reason,
        timeToFirstTokenMs: ttft,
        meta: {
          reasoningSplitReported: typeof thinking === "number",
          fallbackRan,
          ...(fallbackRan ? { costNote: "A server-side fallback model served this request; calculated cost uses the selected model's rates." } : {}),
        },
      };
    } catch (err) {
      if (req.signal.aborted) throw new ProviderError("Request aborted", "aborted", false);
      if (err instanceof Anthropic.APIError) {
        const status = err.status ?? 0;
        throw new ProviderError(`Anthropic HTTP ${status}: ${err.message.slice(0, 500)}`, `http_${status}`, isRetryableStatus(status), status);
      }
      throw new ProviderError(`Anthropic request failed: ${(err as Error).message}`, "network_error", true);
    }
  }
}
