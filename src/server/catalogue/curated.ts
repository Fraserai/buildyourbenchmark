/**
 * The platform's curated model list.
 *
 * Membership and configuration mirror the Artificial Analysis Intelligence Index
 * v4.3.2 chart supplied on 2026-09-27 (27 model configurations). This file only
 * decides WHICH models are in the catalogue and HOW each is configured. Prices,
 * context windows, modalities and live index values come from catalogue sources
 * at refresh time (see sources/). The chart values below are stored as a dated
 * public-reference snapshot, never as enterprise results.
 */

export type CuratedProvider = { id: string; name: string; color: string };

export const PROVIDERS: CuratedProvider[] = [
  { id: "anthropic", name: "Anthropic", color: "#D97757" },
  { id: "openai", name: "OpenAI", color: "#E8E8E8" },
  { id: "google", name: "Google", color: "#34A853" },
  { id: "meta", name: "Meta", color: "#1877F2" },
  { id: "xai", name: "xAI", color: "#8B7CF6" },
  { id: "xiaomi", name: "Xiaomi", color: "#FF6900" },
  { id: "alibaba", name: "Alibaba (Qwen)", color: "#FF8A3D" },
  { id: "zai", name: "Z.ai", color: "#3B82F6" },
  { id: "stepfun", name: "StepFun", color: "#22E3D3" },
  { id: "moonshot", name: "Moonshot AI", color: "#2F6BFF" },
  { id: "deepseek", name: "DeepSeek", color: "#4D6BFE" },
  { id: "mbzuai", name: "MBZUAI (K2)", color: "#3048C8" },
  { id: "minimax", name: "MiniMax", color: "#E8416F" },
  { id: "thinkingmachines", name: "Thinking Machines", color: "#9A9A9A" },
  { id: "nvidia", name: "NVIDIA", color: "#76B900" },
  { id: "mistral", name: "Mistral", color: "#FF7000" },
];

export type CuratedModel = {
  id: string;
  name: string;
  variant: string | null;
  providerId: string;
  /** Used when no source reports open-weights status. */
  weightsDefault: "open" | "closed" | "unknown";
  reasoningEffort: string | null;
  /** Upstream identifiers per catalogue/inference source. */
  openrouterId: string | null;
  anthropicId?: string;
  /** Enable Anthropic server-side refusal fallbacks ("with fallback" configurations). */
  anthropicFallback?: boolean;
  reference: {
    /** AA Intelligence Index as shown on the supplied v4.3.2 chart. */
    intelligenceIndex: number;
    /** AA weighted cost (USD) per Intelligence Index task, from the supplied cost chart, where shown. */
    costPerIndexTaskUsd?: number;
  };
};

export const REFERENCE_CHART_SOURCE = "Artificial Analysis Intelligence Index chart (supplied)";
export const REFERENCE_CHART_VERSION = "v4.3.2";
export const REFERENCE_CHART_CAPTURED_AT = Date.UTC(2026, 8, 27);

export const CURATED_MODELS: CuratedModel[] = [
  { id: "claude-opus-5.5@max", name: "Claude Opus 5.5", variant: "max, with fallback", providerId: "anthropic", weightsDefault: "closed", reasoningEffort: "max", openrouterId: "anthropic/claude-opus-5.5", anthropicId: "claude-opus-5-5", anthropicFallback: true, reference: { intelligenceIndex: 58, costPerIndexTaskUsd: 5.98 } },
  { id: "claude-fable-5.1@max", name: "Claude Fable 5.1", variant: "max, with fallback", providerId: "anthropic", weightsDefault: "closed", reasoningEffort: "max", openrouterId: "anthropic/claude-fable-5.1", anthropicId: "claude-fable-5-1", anthropicFallback: true, reference: { intelligenceIndex: 53, costPerIndexTaskUsd: 7.63 } },
  { id: "gpt-6-astra@max", name: "GPT-6 Astra", variant: "max", providerId: "openai", weightsDefault: "closed", reasoningEffort: "max", openrouterId: "openai/gpt-6-astra", reference: { intelligenceIndex: 53, costPerIndexTaskUsd: 3.26 } },
  { id: "claude-opus-5@max", name: "Claude Opus 5", variant: "max", providerId: "anthropic", weightsDefault: "closed", reasoningEffort: "max", openrouterId: "anthropic/claude-opus-5", anthropicId: "claude-opus-5", reference: { intelligenceIndex: 51 } },
  { id: "muse-spark-1.3@max", name: "Muse Spark 1.3", variant: "max", providerId: "meta", weightsDefault: "closed", reasoningEffort: "max", openrouterId: "meta/muse-spark-1.3", reference: { intelligenceIndex: 48, costPerIndexTaskUsd: 1.6 } },
  { id: "gpt-6-sol@max", name: "GPT-6 Sol", variant: "max", providerId: "openai", weightsDefault: "closed", reasoningEffort: "max", openrouterId: "openai/gpt-6-sol", reference: { intelligenceIndex: 48, costPerIndexTaskUsd: 1.06 } },
  { id: "gpt-5.6-sol@max", name: "GPT-5.6 Sol", variant: "max", providerId: "openai", weightsDefault: "closed", reasoningEffort: "max", openrouterId: "openai/gpt-5.6-sol", reference: { intelligenceIndex: 47 } },
  { id: "grok-4.7@xhigh", name: "Grok 4.7", variant: "xhigh", providerId: "xai", weightsDefault: "closed", reasoningEffort: "xhigh", openrouterId: "x-ai/grok-4.7", reference: { intelligenceIndex: 46, costPerIndexTaskUsd: 3.74 } },
  { id: "mimo-v2.6-pro", name: "MiMo-V2.6-Pro", variant: null, providerId: "xiaomi", weightsDefault: "unknown", reasoningEffort: null, openrouterId: "xiaomi/mimo-v2.6-pro", reference: { intelligenceIndex: 46, costPerIndexTaskUsd: 0.13 } },
  { id: "qwen3.8-max-0902", name: "Qwen3.8 Max (0902)", variant: null, providerId: "alibaba", weightsDefault: "closed", reasoningEffort: null, openrouterId: "qwen/qwen3.8-max-0902", reference: { intelligenceIndex: 45, costPerIndexTaskUsd: 5.41 } },
  { id: "glm-5.3@max", name: "GLM-5.3", variant: "max", providerId: "zai", weightsDefault: "open", reasoningEffort: "max", openrouterId: "z-ai/glm-5.3", reference: { intelligenceIndex: 45, costPerIndexTaskUsd: 2.01 } },
  { id: "grok-4.6@high", name: "Grok 4.6", variant: "high", providerId: "xai", weightsDefault: "closed", reasoningEffort: "high", openrouterId: "x-ai/grok-4.6", reference: { intelligenceIndex: 44, costPerIndexTaskUsd: 1.86 } },
  { id: "step-5-preview", name: "Step 5 Preview", variant: null, providerId: "stepfun", weightsDefault: "unknown", reasoningEffort: null, openrouterId: null, reference: { intelligenceIndex: 44, costPerIndexTaskUsd: 0.72 } },
  { id: "kimi-k3@max", name: "Kimi K3", variant: "max", providerId: "moonshot", weightsDefault: "open", reasoningEffort: "max", openrouterId: "moonshotai/kimi-k3", reference: { intelligenceIndex: 44, costPerIndexTaskUsd: 2.0 } },
  { id: "glm-5.3-flash", name: "GLM-5.3-Flash", variant: null, providerId: "zai", weightsDefault: "open", reasoningEffort: null, openrouterId: "z-ai/glm-5.3-flash", reference: { intelligenceIndex: 42, costPerIndexTaskUsd: 0.25 } },
  { id: "gemini-3.8-flash@high", name: "Gemini 3.8 Flash", variant: "high", providerId: "google", weightsDefault: "closed", reasoningEffort: "high", openrouterId: "google/gemini-3.8-flash", reference: { intelligenceIndex: 41, costPerIndexTaskUsd: 1.24 } },
  { id: "deepseek-v4.1-flash@max", name: "DeepSeek V4.1 Flash", variant: "max", providerId: "deepseek", weightsDefault: "open", reasoningEffort: "max", openrouterId: "deepseek/deepseek-v4.1-flash", reference: { intelligenceIndex: 39, costPerIndexTaskUsd: 0.27 } },
  { id: "gpt-5.6-luna@max", name: "GPT-5.6 Luna", variant: "max", providerId: "openai", weightsDefault: "closed", reasoningEffort: "max", openrouterId: "openai/gpt-5.6-luna", reference: { intelligenceIndex: 37 } },
  { id: "gpt-6-luna@max", name: "GPT-6 Luna", variant: "max", providerId: "openai", weightsDefault: "closed", reasoningEffort: "max", openrouterId: "openai/gpt-6-luna", reference: { intelligenceIndex: 37, costPerIndexTaskUsd: 0.07 } },
  { id: "qwen3.8-27b@xhigh", name: "Qwen3.8 27B", variant: "xhigh", providerId: "alibaba", weightsDefault: "open", reasoningEffort: "xhigh", openrouterId: "qwen/qwen3.8-27b", reference: { intelligenceIndex: 34, costPerIndexTaskUsd: 1.01 } },
  { id: "k2-horizon-375b-a23b", name: "K2 Horizon 375B A23B", variant: null, providerId: "mbzuai", weightsDefault: "unknown", reasoningEffort: null, openrouterId: null, reference: { intelligenceIndex: 31 } },
  { id: "minimax-m3", name: "MiniMax-M3", variant: null, providerId: "minimax", weightsDefault: "open", reasoningEffort: null, openrouterId: "minimax/minimax-m3", reference: { intelligenceIndex: 29, costPerIndexTaskUsd: 0.51 } },
  { id: "inkling", name: "Inkling", variant: null, providerId: "thinkingmachines", weightsDefault: "unknown", reasoningEffort: null, openrouterId: "thinkingmachines/inkling", reference: { intelligenceIndex: 25, costPerIndexTaskUsd: 0.61 } },
  { id: "nemotron-3-ultra", name: "Nemotron 3 Ultra", variant: null, providerId: "nvidia", weightsDefault: "open", reasoningEffort: null, openrouterId: "nvidia/nemotron-3-ultra-550b-a55b", reference: { intelligenceIndex: 23, costPerIndexTaskUsd: 0.55 } },
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite", variant: null, providerId: "google", weightsDefault: "closed", reasoningEffort: null, openrouterId: "google/gemini-3.5-flash-lite", reference: { intelligenceIndex: 22, costPerIndexTaskUsd: 0.12 } },
  { id: "muse-glimmer@high", name: "Muse Glimmer", variant: "high", providerId: "meta", weightsDefault: "unknown", reasoningEffort: "high", openrouterId: "meta/muse-glimmer-30b", reference: { intelligenceIndex: 17, costPerIndexTaskUsd: 0.06 } },
  { id: "mistral-medium-3.5", name: "Mistral Medium 3.5", variant: null, providerId: "mistral", weightsDefault: "closed", reasoningEffort: null, openrouterId: "mistralai/mistral-medium-3-5", reference: { intelligenceIndex: 14, costPerIndexTaskUsd: 0.44 } },
];
