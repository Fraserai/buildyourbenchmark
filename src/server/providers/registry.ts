import { AnthropicProvider } from "./anthropic";
import { DemoProvider } from "./demo";
import { OpenRouterProvider } from "./openrouter";
import type { InferenceProvider } from "./types";

/**
 * Inference provider registry. The rest of the application is model-centric: it
 * never branches on provider. Adding a provider = implementing InferenceProvider
 * and registering it here.
 */
const g = globalThis as unknown as { __workbenchProviders?: Map<string, InferenceProvider> };

function build(): Map<string, InferenceProvider> {
  return new Map<string, InferenceProvider>([
    ["openrouter", new OpenRouterProvider()],
    ["anthropic", new AnthropicProvider()],
    ["demo", new DemoProvider()],
  ]);
}

export function getProviders(): Map<string, InferenceProvider> {
  g.__workbenchProviders ??= build();
  return g.__workbenchProviders;
}

export function getProvider(id: string): InferenceProvider | undefined {
  return getProviders().get(id);
}

/** Tests inject fakes (e.g. a provider that fails on demand). */
export function setProvidersForTesting(providers: InferenceProvider[]) {
  g.__workbenchProviders = new Map(providers.map((p) => [p.id, p]));
}

export function resetProviders() {
  g.__workbenchProviders = undefined;
}

/** Live inference providers in central priority order (INFERENCE_PROVIDER_PRIORITY). */
export function livePriority(): string[] {
  const configured = (process.env.INFERENCE_PROVIDER_PRIORITY ?? "anthropic,openrouter")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const all = [...getProviders().values()].filter((p) => !p.simulated).map((p) => p.id);
  return [...configured.filter((id) => all.includes(id)), ...all.filter((id) => !configured.includes(id))];
}

export function configuredLiveProviders(): InferenceProvider[] {
  return livePriority()
    .map((id) => getProvider(id)!)
    .filter((p) => p.isConfigured());
}

export type RouteChoice = { inferenceProvider: string; providerModelId: string; params: Record<string, unknown> };

/** Pick how a model will be executed for a run. Returns null when no configured route exists. */
export function chooseRoute(
  mode: "live" | "demo",
  modelId: string,
  routes: { inferenceProvider: string; providerModelId: string; params: Record<string, unknown>; enabled: boolean }[],
  reasoningEffort: string | null,
): RouteChoice | null {
  if (mode === "demo") {
    return { inferenceProvider: "demo", providerModelId: modelId, params: reasoningEffort ? { reasoningEffort } : {} };
  }
  for (const id of livePriority()) {
    const provider = getProvider(id);
    const route = routes.find((r) => r.enabled && r.inferenceProvider === id);
    if (provider?.isConfigured() && route) {
      return { inferenceProvider: id, providerModelId: route.providerModelId, params: route.params };
    }
  }
  return null;
}
