/**
 * A catalogue source reports public facts about models it knows. Sources never
 * decide catalogue membership (curated.ts does) and never write to the database
 * (refresh.ts does). Add a new source by implementing this interface.
 */
export type SourceModelRecord = {
  /** The source's own identifier for the model (e.g. OpenRouter slug). */
  sourceId: string;
  canonicalId?: string | null;
  name?: string;
  contextLength?: number | null;
  maxOutputTokens?: number | null;
  inputModalities?: string[];
  openWeights?: boolean | null;
  description?: string | null;
  /** Rates in USD per 1M tokens as exact decimal strings. */
  pricing?: {
    inputPerMTok: string;
    outputPerMTok: string;
    cacheReadPerMTok: string | null;
    cacheWritePerMTok: string | null;
  } | null;
  reference?: { metric: string; value: number; sourceVersion?: string }[];
  supportedEfforts?: string[] | null;
};

export interface CatalogueSource {
  readonly name: string;
  /** Which curated identifier this source keys on. */
  readonly keyField: "openrouterId" | "name";
  fetchModels(signal?: AbortSignal): Promise<SourceModelRecord[]>;
}
