import type { NormalizedUsage } from "../pricing/cost";

/**
 * The canonical task payload. Built once from a task version and delivered to
 * every selected model unchanged; each provider adapter only translates it to
 * its own wire format. Nothing model-specific is ever added to the content.
 */
export type PayloadPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; dataBase64: string; filename: string; sha256: string };

export type TaskPayload = {
  system: string | null;
  user: PayloadPart[];
  maxOutputTokens: number;
};

export type ExecuteRequest = {
  payload: TaskPayload;
  /** Catalogue model id (used by simulated providers). */
  modelId: string;
  providerModelId: string;
  /** Model configuration from the catalogue route, e.g. { reasoningEffort: "max" }. */
  params: Record<string, unknown>;
  signal: AbortSignal;
};

export type ExecuteResult = {
  text: string;
  usage: NormalizedUsage;
  /** Cost reported by the provider for this request (authoritative when present). */
  providerCostUsd: number | null;
  providerRequestId: string | null;
  /** Model identifier the provider reports actually served the request. */
  servedBy: string | null;
  finishReason: string | null;
  timeToFirstTokenMs: number | null;
  meta: Record<string, unknown>;
};

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface InferenceProvider {
  readonly id: string;
  readonly name: string;
  /** Simulated providers produce demo output and are never presented as measurements. */
  readonly simulated: boolean;
  isConfigured(): boolean;
  execute(req: ExecuteRequest): Promise<ExecuteResult>;
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504 || status === 529;
}
