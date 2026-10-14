import type { CatalogueSource, SourceModelRecord } from "./types";

/**
 * Artificial Analysis data API adapter (authoritative reference data).
 * Enabled only when ARTIFICIAL_ANALYSIS_API_KEY is set. Records are matched to
 * curated models by display name. Response fields are read defensively so a
 * shape change degrades to "no reference data" rather than wrong data.
 */
type AAModel = {
  name?: string;
  slug?: string;
  evaluations?: Record<string, number | null | undefined>;
};

export class ArtificialAnalysisSource implements CatalogueSource {
  readonly name = "Artificial Analysis data API";
  readonly keyField = "name" as const;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchModels(signal?: AbortSignal): Promise<SourceModelRecord[]> {
    const res = await this.fetchImpl("https://artificialanalysis.ai/api/v2/data/llms/models", {
      headers: { "x-api-key": this.apiKey, accept: "application/json" },
      signal,
    });
    if (!res.ok) throw new Error(`Artificial Analysis API returned HTTP ${res.status}`);
    const body = (await res.json()) as { data?: AAModel[] };
    if (!Array.isArray(body.data)) throw new Error("Artificial Analysis API: unexpected response shape");
    return body.data.flatMap((m) => {
      const value = m.evaluations?.artificial_analysis_intelligence_index;
      if (!m.name || typeof value !== "number") return [];
      return [{ sourceId: m.name, name: m.name, reference: [{ metric: "aa_intelligence_index", value }] }];
    });
  }
}
