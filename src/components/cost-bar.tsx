import type { CostBreakdown } from "@/server/db/schema";
import { formatUsd } from "@/lib/format";

/** Segmented view of where one execution's cost came from (Input · Cache · Reasoning · Answer). */
const SEGMENTS: { key: keyof CostBreakdown["segmentsNanoUsd"]; label: string; color: string }[] = [
  { key: "input", label: "Input", color: "rgb(63 224 164 / 0.35)" },
  { key: "cacheRead", label: "Cache hit", color: "rgb(63 224 164 / 0.55)" },
  { key: "cacheWrite", label: "Cache write", color: "rgb(63 224 164 / 0.7)" },
  { key: "reasoning", label: "Reasoning", color: "rgb(63 224 164 / 0.85)" },
  { key: "answer", label: "Answer", color: "rgb(63 224 164 / 1)" },
];

export function CostBar({ breakdown, showLegend = false }: { breakdown: CostBreakdown | null; showLegend?: boolean }) {
  if (!breakdown) return null;
  const seg = breakdown.segmentsNanoUsd;
  const total = Object.values(seg).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const present = SEGMENTS.filter((s) => seg[s.key] > 0);
  return (
    <div>
      <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-white/[0.05]" role="img" aria-label={present.map((s) => `${s.label} ${formatUsd(seg[s.key])}`).join(", ")}>
        {present.map((s) => (
          <span key={s.key} style={{ width: `${(seg[s.key] / total) * 100}%`, background: s.color }} title={`${s.label}: ${formatUsd(seg[s.key])}`} />
        ))}
      </div>
      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-faint">
          {present.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
              {s.label} <span className="num text-muted">{formatUsd(seg[s.key])}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
