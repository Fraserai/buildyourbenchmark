import { perTokenToPerMTok } from "../../pricing/cost";
import type { CatalogueSource, SourceModelRecord } from "./types";

type ORModel = {
  id: string;
  canonical_slug?: string;
  hugging_face_id?: string | null;
  name?: string;
  description?: string;
  context_length?: number | null;
  architecture?: { input_modalities?: string[] };
  pricing?: Record<string, string | undefined>;
  top_provider?: { max_completion_tokens?: number | null };
  benchmarks?: { artificial_analysis?: { intelligence_index?: number | null } };
  reasoning?: { supported_efforts?: string[] } | null;
};

/** OpenRouter's public model list: live per-token pricing, context, modalities and AA index values. No key required. */
export class OpenRouterCatalogueSource implements CatalogueSource {
  readonly name = "OpenRouter public models API";
  readonly keyField = "openrouterId" as const;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async fetchModels(signal?: AbortSignal): Promise<SourceModelRecord[]> {
    const res = await this.fetchImpl("https://openrouter.ai/api/v1/models", {
      headers: { accept: "application/json" },
      signal,
    });
    if (!res.ok) throw new Error(`OpenRouter models API returned HTTP ${res.status}`);
    const body = (await res.json()) as { data?: ORModel[] };
    if (!Array.isArray(body.data)) throw new Error("OpenRouter models API: unexpected response shape");
    return body.data.map(toRecord);
  }
}

function price(v: string | undefined): string | null {
  if (v == null || v === "" || Number(v) < 0) return null;
  try {
    return perTokenToPerMTok(v);
  } catch {
    return null;
  }
}

export function toRecord(m: ORModel): SourceModelRecord {
  const input = price(m.pricing?.prompt);
  const output = price(m.pricing?.completion);
  const aa = m.benchmarks?.artificial_analysis?.intelligence_index;
  return {
    sourceId: m.id,
    canonicalId: m.canonical_slug ?? m.id,
    name: m.name,
    description: m.description ?? null,
    contextLength: m.context_length ?? null,
    maxOutputTokens: m.top_provider?.max_completion_tokens ?? null,
    inputModalities: m.architecture?.input_modalities,
    openWeights: m.hugging_face_id ? true : null,
    pricing:
      input != null && output != null
        ? {
            inputPerMTok: input,
            outputPerMTok: output,
            cacheReadPerMTok: price(m.pricing?.input_cache_read),
            cacheWritePerMTok: price(m.pricing?.input_cache_write),
          }
        : null,
    reference: typeof aa === "number" ? [{ metric: "aa_intelligence_index", value: aa }] : [],
    supportedEfforts: m.reasoning?.supported_efforts ?? null,
  };
}
