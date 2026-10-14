# Workbench

**Run your real work against AI. Measure what actually happens.**

A self-service, multi-tenant platform where a business creates the exact work it performs, selects any models it wants, runs that work against them, and permanently records the actual **price**, **time** and **output** of every execution. No recommendations, no winners, no quality scores: the platform provides the evidence and the enterprise decides.

```
CREATE TASK → SELECT MODELS → RUN → PRICE · TIME · OUTPUT → SAVED PERMANENTLY
```

## Quick start

```bash
npm install
npm run bootstrap     # generates secrets into .env.local, creates the DB, pulls the live model catalogue
npm run dev           # http://localhost:3000 (execution worker runs in-process)
```

> Use `npm run …` (or `./node_modules/.bin/…`). Don't use `pnpm setup` for this project: that is pnpm's own shell-setup command.

With no provider key the app runs in **demo mode**: simulated executions that are clearly labelled and never presented as measurements. To measure real runs, add a key to `.env.local` and restart:

| Variable | Effect |
|---|---|
| `OPENROUTER_API_KEY` | One key routes every priced catalogue model; responses include the **billed** cost per request |
| `ANTHROPIC_API_KEY` | Claude models go direct to Anthropic (cost calculated from usage × frozen pricing snapshot) |
| `INFERENCE_PROVIDER_PRIORITY` | Central routing order when several providers can serve a model (default `anthropic,openrouter`) |
| `ARTIFICIAL_ANALYSIS_API_KEY` | Optional: authoritative reference scores direct from Artificial Analysis |

Other commands: `npm test` (48 tests), `npm run typecheck`, `npm run build`, `npm run worker` (standalone worker; set `WORKER_INPROCESS=false` on the web process), `npm run catalogue:refresh`.

## Architecture

```
Next.js App Router (server components + server actions)
  │
  ├─ Tenant-scoped services (every query filtered by organization_id)
  │    tasks · runs · orgs · catalogue (read) · auth
  │
  ├─ Run creation ── freezes task version, payload hash, model version, route, pricing snapshot
  │        │
  │        ▼
  ├─ Job queue (DB-backed, atomic claim, heartbeats) ──► Workers (in-process or `npm run worker`)
  │                                                         │  one independent job per model
  │                                                         ▼
  │                               Provider registry → OpenRouter | Anthropic | Demo(simulated)
  │                                                         │
  │                          usage → cost engine (BigInt nano-USD) → artifact store → ledger
  │
  └─ UI polls /api/runs/:id every second while executions are active
```

**Stack:** Next.js 16, React 19, TypeScript, Tailwind 4, Drizzle ORM on SQLite (WAL). The schema is dialect-portable to Postgres. Vitest for tests.

### Key decisions

- **Public model data and enterprise results are separate tables and separate UI.** Catalogue tables (`models`, `model_pricing_snapshots`, `model_reference_data`, …) carry no `organization_id`; enterprise tables all do. The catalogue page labels reference data as "not a measurement of your work".
- **Everything that affects a result is versioned and append-only.** `task_versions` (content-hashed), `model_versions`, `model_pricing_snapshots`. A run references the exact ids; nothing is ever recomputed from "current" values.
- **Same task, provably.** The canonical payload is built once per task version (instructions → system; input + files → user; documents extracted to text once so every model reads identical content). Its sha256 is frozen on the run, recomputed by every execution, and shown in the UI.
- **Actual cost.** Provider-billed amount when reported (OpenRouter), otherwise usage × the run's frozen pricing snapshot. Both numbers are stored, along with the rates used and an Input / Cache hit / Cache write / Reasoning / Answer breakdown. All math is in integer nano-USD from decimal strings.
- **Actual time.** `performance.now()` around the provider call that produced the output, plus time-to-first-token from streaming. Retries are recorded as attempts.
- **Honest failures.** Each model is its own job, so failures are isolated and runs end as `completed | partial | failed | cancelled`. A job abandoned by a dead worker is failed, never silently re-run and double-billed.
- **Demo mode can't masquerade.** Demo runs use a separate simulated provider; the executor refuses to mix live and simulated in one run; results carry `cost_source = simulated`; demo runs are never written to the billing ledger.

### Model catalogue

The catalogue membership is the 27 configurations from the Artificial Analysis Intelligence Index v4.3.2 chart (`src/server/catalogue/curated.ts`), including each reasoning-effort setting. At refresh time (on bootstrap, then every 6h):

- **OpenRouter's public models API** supplies live per-token pricing, context length, input modalities, open-weights signal and AA index values (no key required).
- The supplied chart values are stored as a dated reference snapshot.
- Price changes create new snapshots; models that vanish upstream become `unavailable` (never deleted); a failing source leaves data untouched.
- **Step 5 Preview** and **K2 Horizon 375B A23B** have no public per-token pricing in any source yet, so they are listed as *No pricing* and can't be run. This is on purpose: cost would otherwise have to be invented.

### Security

scrypt password hashing; opaque session tokens stored hashed; httpOnly cookies. Tenant-scoped service layer (cross-tenant access returns 404, covered by tests). Files are encrypted at rest with AES-256-GCM and served only via short-lived HMAC-signed links that also re-check membership. The logger drops content fields by design. OpenRouter requests use `data_collection: deny`. There is an append-only audit trail, single-use invite links, and security headers.

### Billing

`usage_ledger` records the actual inference cost of every live execution with the org's `billing_mode` (`passthrough` or `included`). Invoicing strategy is a separate decision from the measured cost users see.

## Tests

`tests/` covers the cost engine, catalogue refresh and pricing history, tenant isolation, task versioning and payload determinism, execution (3 models, partial failure, retries, cancellation, concurrency, abandoned workers, demo labelling), auth and invites, and the full Section 48 product test (`tests/final-product.test.ts`).

## Not built yet (deliberately)

Direct OpenAI and Google adapters (each is one file implementing `InferenceProvider`; OpenRouter already serves those models), XLSX parsing (CSV works), configurable retention, SSO, Postgres/S3 deployment adapters, and streaming partial output into the UI.
