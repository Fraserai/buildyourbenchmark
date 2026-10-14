"use client";

import { useActionState, useMemo, useState } from "react";
import { createRunAction, type ActionState } from "@/app/actions";
import type { CatalogueModel } from "@/server/catalogue/service";
import { Badge, Button, FormMessage, Icon, ProviderDot, cx } from "./ui";
import { formatCompact, formatRate } from "@/lib/format";

type Sort = "catalogue" | "price" | "reference" | "name";

export function ModelPicker({
  task,
  models,
  liveProviders,
  initialSelection,
}: {
  task: { id: string; versionId: string; version: number; name: string; approxInputTokens: number; hasImages: boolean };
  models: CatalogueModel[];
  liveProviders: string[];
  initialSelection: string[];
}) {
  const liveAvailable = liveProviders.length > 0;
  const [mode, setMode] = useState<"live" | "demo">(liveAvailable ? "live" : "demo");
  const [selected, setSelected] = useState<string[]>(() => initialSelection.filter((id) => models.some((m) => m.id === id)));
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState<string>("all");
  const [weights, setWeights] = useState<"all" | "open" | "closed">("all");
  const [sort, setSort] = useState<Sort>("catalogue");
  const [state, action, pending] = useActionState<ActionState, FormData>(createRunAction, undefined);

  const runnable = (m: CatalogueModel) => (mode === "live" ? m.runnableLive : m.runnableDemo);
  const warnings = (m: CatalogueModel) => {
    const w: string[] = [];
    if (task.hasImages && !m.inputModalities.includes("image")) w.push("No image input");
    if (m.contextLength && task.approxInputTokens > m.contextLength * 0.9) w.push("Input may exceed context");
    return w;
  };
  const blockedReason = (m: CatalogueModel) => {
    if (!m.pricing) return "No published pricing: cost can't be measured";
    if (mode === "live" && m.status !== "available") return m.statusReason ?? "Not currently available";
    if (mode === "live" && !m.runnableLive) return "No connected provider serves this model";
    return null;
  };

  const providers = useMemo(() => [...new Map(models.map((m) => [m.providerId, { name: m.providerName, color: m.providerColor }])).entries()], [models]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = models
      .filter((m) => (needle ? `${m.name} ${m.variant ?? ""} ${m.providerName}`.toLowerCase().includes(needle) : true))
      .filter((m) => provider === "all" || m.providerId === provider)
      .filter((m) => weights === "all" || m.weights === weights);
    const priceOf = (m: CatalogueModel) => (m.pricing ? Number(m.pricing.inputPerMTok) + Number(m.pricing.outputPerMTok) : Infinity);
    return [...list].sort((a, b) => {
      const ra = runnable(a) ? 0 : 1;
      const rb = runnable(b) ? 0 : 1;
      if (ra !== rb) return ra - rb;
      if (sort === "price") return priceOf(a) - priceOf(b);
      if (sort === "reference") return (b.reference.intelligenceIndex?.value ?? -1) - (a.reference.intelligenceIndex?.value ?? -1);
      if (sort === "name") return a.name.localeCompare(b.name);
      return a.sortOrder - b.sortOrder;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, q, provider, weights, sort, mode]);

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const validSelected = selected.filter((id) => {
    const m = models.find((x) => x.id === id);
    return m && runnable(m);
  });
  const invalidSelected = selected.filter((id) => !validSelected.includes(id));
  const selectVisible = () => setSelected((cur) => [...new Set([...cur, ...visible.filter(runnable).map((m) => m.id)])]);

  return (
    <form action={action} className="grid gap-8 pb-24 lg:grid-cols-[1fr_340px] lg:pb-0">
      <input type="hidden" name="taskId" value={task.id} />
      <input type="hidden" name="taskVersionId" value={task.versionId} />
      <input type="hidden" name="mode" value={mode} />
      {validSelected.map((id) => (
        <input key={id} type="hidden" name="modelIds" value={id} />
      ))}

      <div className="min-w-0">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models" className="field pl-9" aria-label="Search models" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-xl border border-line bg-black/20 p-1 text-sm">
              {(["all", "open", "closed"] as const).map((w) => (
                <button type="button" key={w} onClick={() => setWeights(w)} className={cx("rounded-lg px-3 py-1.5 capitalize", weights === w ? "bg-white/10 text-white" : "text-muted hover:text-fg")}>
                  {w === "all" ? "All" : w}
                </button>
              ))}
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="field w-auto py-2" aria-label="Sort">
              <option value="catalogue">Catalogue order</option>
              <option value="price">List price (low → high)</option>
              <option value="reference">Public intelligence index</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button type="button" onClick={() => setProvider("all")} className={cx("shrink-0 rounded-full border px-3 py-1.5 text-xs", provider === "all" ? "border-line-strong bg-white/10 text-white" : "border-line text-muted hover:text-fg")}>
            All providers
          </button>
          {providers.map(([id, p]) => (
            <button type="button" key={id} onClick={() => setProvider(id)} className={cx("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs", provider === id ? "border-line-strong bg-white/10 text-white" : "border-line text-muted hover:text-fg")}>
              <ProviderDot color={p.color} className="h-2 w-2 ring-0" /> {p.name}
            </button>
          ))}
        </div>

        <div className="mb-2 flex items-center justify-between px-1 text-xs text-faint">
          <span>{visible.filter(runnable).length} of {visible.length} runnable in {mode} mode</span>
          <div className="flex gap-3">
            <button type="button" onClick={selectVisible} className="hover:text-fg">
              Select all shown
            </button>
            <button type="button" onClick={() => setSelected([])} className="hover:text-fg">
              Clear
            </button>
          </div>
        </div>

        <div className="panel divide-y divide-line overflow-hidden">
          {visible.map((m) => {
            const blocked = blockedReason(m);
            const isOn = selected.includes(m.id);
            const warn = warnings(m);
            return (
              <button
                type="button"
                key={m.id}
                onClick={() => !blocked && toggle(m.id)}
                disabled={Boolean(blocked) && !isOn}
                aria-pressed={isOn}
                className={cx(
                  "grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3.5 text-left transition-colors sm:px-5",
                  isOn ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
                  blocked && "cursor-not-allowed opacity-45",
                )}
              >
                <span className={cx("grid h-5 w-5 place-items-center rounded-md border transition-colors", isOn ? "border-transparent bg-white text-ink-950" : "border-line-strong")}>
                  {isOn && <Icon name="check" className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-start gap-2">
                    <ProviderDot color={m.providerColor} className="mt-[5px]" />
                    <span className="min-w-0">
                      <span className="font-medium text-fg">{m.name}</span>
                      {m.variant && <span className="ml-2 text-xs text-faint">{m.variant}</span>}
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[18px] text-xs text-faint">
                    <span>{m.providerName}</span>
                    <span>{m.weights === "open" ? "Open weights" : m.weights === "closed" ? "Closed" : "Weights unknown"}</span>
                    <span>{formatCompact(m.contextLength)} ctx</span>
                    {m.ownCompletedRuns > 0 && <span className="text-output">{m.ownCompletedRuns} of your executions</span>}
                    {blocked && <span className="text-demo">{blocked}</span>}
                    {!blocked && warn.map((w) => (
                      <span key={w} className="text-demo">
                        {w}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="text-right">
                  <span className="num block text-sm text-fg">
                    {formatRate(m.pricing?.inputPerMTok)} <span className="text-faint">/</span> {formatRate(m.pricing?.outputPerMTok)}
                  </span>
                  <span className="block text-[11px] text-faint">
                    list per 1M in/out{m.reference.intelligenceIndex ? ` · idx ${Math.round(m.reference.intelligenceIndex.value)}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
          {visible.length === 0 && <div className="px-5 py-10 text-center text-sm text-muted">No models match.</div>}
        </div>
      </div>

      {/* Phone: keep the run action reachable while scrolling the catalogue. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink-950/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-xs text-muted">
            <span className="num text-fg">{validSelected.length}</span> selected · <span className={mode === "demo" ? "text-demo" : "text-ok"}>{mode === "demo" ? "Demo" : "Live"}</span>
          </div>
          <Button className="h-11" disabled={pending || validSelected.length === 0}>
            {pending ? "Starting…" : `Run${validSelected.length ? ` on ${validSelected.length}` : ""}`}
          </Button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="panel space-y-6 p-6">
          <div>
            <div className="eyebrow">Run</div>
            <div className="mt-2 text-lg font-medium leading-snug text-white">{task.name}</div>
            <div className="mt-1 text-xs text-faint">
              v{task.version} · ≈{formatCompact(task.approxInputTokens)} tokens of input{task.hasImages ? " · includes images" : ""}
            </div>
          </div>

          <div>
            <div className="label">Mode</div>
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-black/25 p-1 text-sm">
              <button type="button" disabled={!liveAvailable} onClick={() => setMode("live")} className={cx("rounded-lg px-3 py-2", mode === "live" ? "bg-white text-ink-950" : "text-muted hover:text-fg", !liveAvailable && "cursor-not-allowed opacity-40")}>
                Live
              </button>
              <button type="button" onClick={() => setMode("demo")} className={cx("rounded-lg px-3 py-2", mode === "demo" ? "bg-demo text-ink-950" : "text-muted hover:text-fg")}>
                Demo
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-faint">
              {mode === "live"
                ? `Real calls via ${liveProviders.join(", ")}. You are billed actual inference cost.`
                : liveAvailable
                  ? "Simulated. No model is called and nothing is billed. Results are labelled demo and are not measurements."
                  : "No inference provider is connected, so only demo mode is available. Results are simulated and labelled as such."}
            </p>
          </div>

          <div>
            <div className="label flex items-center justify-between">
              <span>Selected</span>
              <span className="num normal-case tracking-normal text-fg">{validSelected.length}</span>
            </div>
            {validSelected.length === 0 ? (
              <p className="text-sm text-faint">Choose one model or many. There is no minimum and no recommended set.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {validSelected.map((id) => {
                  const m = models.find((x) => x.id === id)!;
                  return (
                    <button type="button" key={id} onClick={() => toggle(id)} className="flex items-center gap-1.5 rounded-full border border-line bg-white/[0.04] py-1 pl-2 pr-1.5 text-xs text-fg hover:border-line-strong">
                      <ProviderDot color={m.providerColor} className="h-2 w-2 ring-0" />
                      {m.name}
                      {m.variant && <span className="text-faint">{m.variant}</span>}
                      <Icon name="x" className="h-3 w-3 text-faint" />
                    </button>
                  );
                })}
              </div>
            )}
            {invalidSelected.length > 0 && <p className="mt-2 text-xs text-demo">{invalidSelected.length} selected model(s) can&apos;t run in {mode} mode and will be skipped.</p>}
          </div>

          <div>
            <input name="label" className="field text-sm" placeholder="Run label (optional)" maxLength={120} />
          </div>

          <FormMessage state={state} />
          <Button className="h-12 w-full text-[15px]" disabled={pending || validSelected.length === 0}>
            {pending ? "Starting…" : validSelected.length === 0 ? "Select models" : `Run on ${validSelected.length} model${validSelected.length === 1 ? "" : "s"}`}
            {!pending && validSelected.length > 0 && <Icon name="play" className="h-3.5 w-3.5" />}
          </Button>
          {mode === "demo" && <Badge tone="demo">Demo · simulated</Badge>}
          <p className="text-[11px] leading-relaxed text-faint">Every selected model receives the identical task: same instructions, same inputs, same limits. Nothing is rewritten per model.</p>
        </div>
      </aside>
    </form>
  );
}
