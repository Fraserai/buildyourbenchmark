import { ProviderError, isRetryableStatus, type ExecuteRequest, type ExecuteResult, type InferenceProvider, type PayloadPart } from "./types";

/**
 * OpenRouter adapter (OpenAI-compatible chat completions, streamed).
 *
 * Streaming is used so long reasoning runs are not cut off by HTTP header
 * timeouts, and to capture time-to-first-token. The final chunk carries usage
 * including `cost`: the amount OpenRouter actually billed for the request.
 */
export class OpenRouterProvider implements InferenceProvider {
  readonly id = "openrouter";
  readonly name = "OpenRouter";
  readonly simulated = false;

  constructor(
    private readonly apiKey: string | undefined = process.env.OPENROUTER_API_KEY,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async execute(req: ExecuteRequest): Promise<ExecuteResult> {
    if (!this.apiKey) throw new ProviderError("OPENROUTER_API_KEY is not configured", "provider_not_configured", false);

    const messages: unknown[] = [];
    if (req.payload.system) messages.push({ role: "system", content: req.payload.system });
    messages.push({ role: "user", content: req.payload.user.map(toContentPart) });

    const body: Record<string, unknown> = {
      model: req.providerModelId,
      messages,
      max_tokens: req.payload.maxOutputTokens,
      stream: true,
      usage: { include: true },
      // Central routing policy: never route enterprise data to endpoints that retain it for training.
      provider: { data_collection: process.env.OPENROUTER_DATA_COLLECTION === "allow" ? "allow" : "deny" },
    };
    if (typeof req.params.reasoningEffort === "string") body.reasoning = { effort: req.params.reasoningEffort };

    const started = performance.now();
    let res: Response;
    try {
      res = await this.fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          "x-title": "Workbench",
        },
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (err) {
      if (req.signal.aborted) throw new ProviderError("Request aborted", "aborted", false);
      throw new ProviderError(`Network error contacting OpenRouter: ${(err as Error).message}`, "network_error", true);
    }

    if (!res.ok || !res.body) {
      const detail = await safeErrorText(res);
      throw new ProviderError(`OpenRouter HTTP ${res.status}: ${detail}`, `http_${res.status}`, isRetryableStatus(res.status), res.status);
    }

    let text = "";
    let ttft: number | null = null;
    let usage: ORUsage | null = null;
    let finishReason: string | null = null;
    let requestId: string | null = null;
    let servedBy: string | null = null;
    let upstreamProvider: string | null = null;

    for await (const event of sseEvents(res.body, req.signal)) {
      if (event === "[DONE]") break;
      let chunk: ORChunk;
      try {
        chunk = JSON.parse(event);
      } catch {
        continue;
      }
      if (chunk.error) {
        throw new ProviderError(`OpenRouter stream error: ${chunk.error.message ?? "unknown"}`, `stream_${chunk.error.code ?? "error"}`, text.length === 0 && isRetryableStatus(Number(chunk.error.code)));
      }
      requestId ??= chunk.id ?? null;
      servedBy = chunk.model ?? servedBy;
      upstreamProvider = chunk.provider ?? upstreamProvider;
      const choice = chunk.choices?.[0];
      const delta = choice?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        if (ttft === null) ttft = Math.round(performance.now() - started);
        text += delta;
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (chunk.usage) usage = chunk.usage;
    }

    if (!usage) throw new ProviderError("OpenRouter response ended without usage data", "missing_usage", false);

    const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
    const cacheWrite = usage.prompt_tokens_details?.cache_write_tokens ?? 0;
    const reasoning = Math.min(usage.completion_tokens_details?.reasoning_tokens ?? 0, usage.completion_tokens ?? 0);

    return {
      text,
      usage: {
        inputTokens: Math.max(0, (usage.prompt_tokens ?? 0) - cached - cacheWrite),
        cacheReadTokens: cached,
        cacheWriteTokens: cacheWrite,
        outputTokens: usage.completion_tokens ?? 0,
        reasoningTokens: reasoning,
      },
      providerCostUsd: typeof usage.cost === "number" ? usage.cost : null,
      providerRequestId: requestId,
      servedBy,
      finishReason,
      timeToFirstTokenMs: ttft,
      meta: { upstreamProvider, rawUsage: usage },
    };
  }
}

type ORUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
  prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
};

type ORChunk = {
  id?: string;
  model?: string;
  provider?: string;
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: ORUsage;
  error?: { code?: number | string; message?: string };
};

function toContentPart(p: PayloadPart) {
  if (p.type === "text") return { type: "text", text: p.text };
  return { type: "image_url", image_url: { url: `data:${p.mimeType};base64,${p.dataBase64}` } };
}

async function safeErrorText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    try {
      const j = JSON.parse(t) as { error?: { message?: string } };
      return (j.error?.message ?? t).slice(0, 500);
    } catch {
      return t.slice(0, 500);
    }
  } catch {
    return res.statusText;
  }
}

/** Minimal server-sent-events reader yielding each `data:` payload. */
export async function* sseEvents(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal.aborted) throw new ProviderError("Request aborted", "aborted", false);
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, "");
        buffer = buffer.slice(idx + 1);
        if (line.startsWith("data:")) yield line.slice(5).trimStart();
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith("data:")) yield tail.slice(5).trimStart();
  } finally {
    reader.releaseLock();
  }
}
