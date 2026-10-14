"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon, cx } from "./ui";

export type ArtifactType = "text" | "markdown" | "json" | "code";

export function OutputBody({ content, type, raw }: { content: string; type: ArtifactType; raw?: boolean }) {
  if (!content) return <div className="text-sm italic text-faint">The model returned an empty response.</div>;
  if (raw) return <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-fg/90">{content}</pre>;
  if (type === "json") {
    let pretty = content;
    try {
      pretty = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      /* show as-is */
    }
    return <pre className="scroll-thin overflow-x-auto rounded-xl border border-line bg-black/35 p-4 font-mono text-[13px] leading-relaxed text-fg/90">{pretty}</pre>;
  }
  if (type === "text") return <div className="prose-output whitespace-pre-wrap">{content}</div>;
  return (
    <div className="prose-output">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function CopyButton({ text, getText, label = "Copy", className }: { text?: string; getText?: () => Promise<string>; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const value = text ?? (getText ? await getText() : "");
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      className={cx("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:bg-white/[0.06] hover:text-fg", className)}
    >
      <Icon name={done ? "check" : "copy"} className={cx("h-3.5 w-3.5", done && "text-price")} />
      {done ? "Copied" : label}
    </button>
  );
}

export async function fetchArtifact(id: string): Promise<{ content: string; artifactType: ArtifactType }> {
  const res = await fetch(`/api/artifacts/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load output");
  return res.json();
}

export function RawToggle({ raw, setRaw }: { raw: boolean; setRaw: (v: boolean) => void }) {
  return (
    <div className="flex rounded-lg border border-line bg-black/20 p-0.5 text-xs">
      {[
        { v: false, l: "Rendered" },
        { v: true, l: "Raw" },
      ].map((o) => (
        <button key={o.l} type="button" onClick={() => setRaw(o.v)} className={cx("rounded-md px-2.5 py-1", raw === o.v ? "bg-white/10 text-white" : "text-muted hover:text-fg")}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

/** Full-screen reader for one model's output. */
export function OutputModal({
  artifactId,
  title,
  subtitle,
  onClose,
}: {
  artifactId: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
}) {
  const [data, setData] = useState<{ content: string; artifactType: ArtifactType } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);

  useEffect(() => {
    fetchArtifact(artifactId).then(setData, (e) => setError(e.message));
  }, [artifactId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal>
      <div className="panel rise flex max-h-full w-full max-w-4xl flex-col !rounded-none !bg-ink-900/95 sm:max-h-[90dvh] sm:!rounded-[20px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium text-white">{title}</div>
            {subtitle && <div className="mt-0.5 text-xs text-faint">{subtitle}</div>}
          </div>
          <RawToggle raw={raw} setRaw={setRaw} />
          {data && <CopyButton text={data.content} />}
          <a href={`/api/artifacts/${artifactId}?download=1`} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:bg-white/[0.06] hover:text-fg">
            <Icon name="download" className="h-3.5 w-3.5" /> Download
          </a>
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-white/[0.06] hover:text-fg" aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          {error ? <div className="text-sm text-danger">{error}</div> : data ? <OutputBody content={data.content} type={data.artifactType} raw={raw} /> : <div className="shimmer h-40 rounded-xl" />}
        </div>
      </div>
    </div>
  );
}
