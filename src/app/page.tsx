import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/next";
import { ButtonLink, Icon, Logo } from "@/components/ui";

export default async function Landing() {
  if (await getSession()) redirect("/workspace");

  const steps = [
    { n: "01", title: "Create a task", body: "Paste the real work: the instructions your team follows, the email, the contract, the spreadsheet." },
    { n: "02", title: "Choose your models", body: "Pick one model or twenty from a live catalogue of closed and open-weight models." },
    { n: "03", title: "Run it", body: "Every model receives exactly the same task. Executions run in parallel." },
    { n: "04", title: "Measure", body: "The actual price, the actual time and the actual output of every execution, saved permanently." },
  ];

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-20 max-w-[1200px] items-center justify-between px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg">
            Sign in
          </Link>
          <ButtonLink href="/signup" className="h-9">
            Start free
          </ButtonLink>
        </div>
      </header>

      <section className="mx-auto max-w-[1200px] px-4 pb-16 pt-14 sm:px-6 md:pt-24">
        <div className="eyebrow mb-6 flex items-center gap-2">
          <span className="spectrum h-px w-8" /> A benchmark for your business, built from your actual work
        </div>
        <h1 className="display max-w-4xl text-[44px] leading-[1.02] text-white sm:text-6xl md:text-[84px]">
          Run your real work against AI. <span className="italic text-muted">Measure what actually happens.</span>
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted">
          Public benchmarks score models on someone else&apos;s questions. Workbench runs <em className="not-italic text-fg">your</em> tasks through the models you choose and records three things: what it cost, how long it took, and exactly what it produced. You decide what the results mean.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink href="/signup" className="h-12 px-6 text-[15px]">
            Create your workspace <Icon name="arrow" />
          </ButtonLink>
          <ButtonLink href="/login" variant="secondary" className="h-12 px-6 text-[15px]">
            Sign in
          </ButtonLink>
        </div>

        <div className="mt-20 grid gap-4 md:grid-cols-3">
          {[
            { k: "bg-price", label: "Price", t: "Actual cost of the run", d: "Billed or calculated from real token usage against a frozen pricing snapshot. Yesterday's cost never changes." },
            { k: "bg-time", label: "Time", t: "Actual elapsed time", d: "Wall-clock time of each execution, measured, never estimated." },
            { k: "bg-output", label: "Output", t: "The exact artifact", d: "Every word each model produced, stored verbatim. Open it, copy it, compare it side by side." },
          ].map((m) => (
            <div key={m.k} className="panel p-6">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${m.k}`} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{m.label}</span>
              </div>
              <div className="mt-5 text-xl font-medium text-white">{m.t}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{m.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-20 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n} className="bg-ink-950/90 p-6">
              <div className="num text-sm text-faint">{s.n}</div>
              <div className="mt-6 text-[15px] font-medium text-white">{s.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-16 max-w-2xl text-sm text-faint">
          No automatic winners. No quality score standing in for the output. The platform provides the evidence; your team makes the decision.
        </p>
      </section>
    </div>
  );
}
