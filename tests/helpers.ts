import { createDb, setDbForTesting, type DB } from "@/server/db/client";
import { signUp } from "@/server/auth/service";
import type { Ctx } from "@/server/auth/context";
import { refreshCatalogue } from "@/server/catalogue/refresh";
import { CURATED_MODELS } from "@/server/catalogue/curated";
import type { CatalogueSource, SourceModelRecord } from "@/server/catalogue/sources/types";
import { setProvidersForTesting } from "@/server/providers/registry";
import { DemoProvider } from "@/server/providers/demo";
import { ProviderError, type ExecuteRequest, type ExecuteResult, type InferenceProvider } from "@/server/providers/types";
import { payloadHash } from "@/server/tasks/payload";

export function freshDb(): DB {
  const db = createDb(":memory:");
  setDbForTesting(db);
  return db;
}

let orgCounter = 0;
export async function makeOrg(name = "Org"): Promise<Ctx> {
  orgCounter++;
  const { userId, organizationId } = await signUp({
    name: `${name} Owner`,
    email: `owner${orgCounter}@${name.toLowerCase().replace(/\W/g, "")}.test`,
    password: "correct horse battery",
    organizationName: name,
  });
  return { userId, organizationId, role: "owner" };
}

/** A catalogue source serving fixed records keyed by OpenRouter id. */
export class FakeCatalogueSource implements CatalogueSource {
  readonly name = "Fake catalogue";
  readonly keyField = "openrouterId" as const;
  constructor(public records: SourceModelRecord[], public fail = false) {}
  async fetchModels() {
    if (this.fail) throw new Error("source down");
    return this.records;
  }
}

export function catalogueRecords(overrides: Record<string, Partial<SourceModelRecord>> = {}): SourceModelRecord[] {
  return CURATED_MODELS.filter((m) => m.openrouterId).map((m) => ({
    sourceId: m.openrouterId!,
    canonicalId: `${m.openrouterId}-20260901`,
    name: m.name,
    contextLength: 1_000_000,
    inputModalities: ["text", "image"],
    pricing: { inputPerMTok: "2", outputPerMTok: "10", cacheReadPerMTok: "0.2", cacheWritePerMTok: null },
    reference: [{ metric: "aa_intelligence_index", value: m.reference.intelligenceIndex + 0.1 }],
    ...overrides[m.openrouterId!],
  }));
}

export async function seedCatalogue(overrides: Record<string, Partial<SourceModelRecord>> = {}) {
  return refreshCatalogue({ trigger: "test", sources: [new FakeCatalogueSource(catalogueRecords(overrides))] });
}

type Behavior = {
  text?: string;
  usage?: ExecuteResult["usage"];
  providerCostUsd?: number | null;
  delayMs?: number;
  failWith?: ProviderError;
  failTimes?: number;
};

/** A live (non-simulated) provider whose behaviour is scripted per provider model id. */
export class ScriptedProvider implements InferenceProvider {
  readonly simulated = false;
  calls: { providerModelId: string; hash: string; params: Record<string, unknown>; payload: ExecuteRequest["payload"] }[] = [];
  private failures = new Map<string, number>();
  constructor(
    readonly id: string,
    public behaviors: Record<string, Behavior> = {},
    readonly name = id,
  ) {}
  isConfigured() {
    return true;
  }
  async execute(req: ExecuteRequest): Promise<ExecuteResult> {
    this.calls.push({ providerModelId: req.providerModelId, hash: payloadHash(req.payload), params: req.params, payload: req.payload });
    const b = this.behaviors[req.providerModelId] ?? {};
    if (b.delayMs) await new Promise((r) => setTimeout(r, b.delayMs));
    if (b.failWith) {
      const n = this.failures.get(req.providerModelId) ?? 0;
      if (b.failTimes === undefined || n < b.failTimes) {
        this.failures.set(req.providerModelId, n + 1);
        throw b.failWith;
      }
    }
    return {
      text: b.text ?? `Output from ${req.providerModelId}`,
      usage: b.usage ?? { inputTokens: 12341, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1242, reasoningTokens: 200 },
      providerCostUsd: b.providerCostUsd ?? null,
      providerRequestId: `req_${req.providerModelId}`,
      servedBy: req.providerModelId,
      finishReason: "stop",
      timeToFirstTokenMs: 5,
      meta: {},
    };
  }
}

export function installProviders(...live: InferenceProvider[]) {
  setProvidersForTesting([...live, new DemoProvider(0.001)]);
}
