/**
 * Data model.
 *
 * Two strictly separated worlds live in this schema:
 *
 *  PUBLIC MODEL DATA (platform-wide, no organization_id):
 *    providers, models, model_versions, model_routes, model_pricing_snapshots,
 *    model_reference_data, catalogue_refreshes
 *
 *  PRIVATE ENTERPRISE DATA (every row carries organization_id and is only ever
 *  read through tenant-scoped services):
 *    organizations, memberships, departments, workflows, tasks, task_versions,
 *    task_files, runs, run_models, run_artifacts, usage_ledger, audit_events
 *
 * Everything that can change a result is versioned and referenced by id from the
 * run record: task_versions, model_versions and model_pricing_snapshots are
 * append-only. A run never points at "the current" anything.
 */
import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const ts = (name: string) => integer(name, { mode: "number" });
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

// ---------------------------------------------------------------------------
// Identity & tenancy
// ---------------------------------------------------------------------------

export const organizations = sqliteTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** How inference cost is billed: passed through at cost, or included in platform usage. */
  billingMode: text("billing_mode", { enum: ["passthrough", "included"] }).notNull().default("passthrough"),
  createdAt: ts("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: ts("created_at").notNull(),
});

export const memberships = sqliteTable(
  "memberships",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    userId: text("user_id").notNull().references(() => users.id),
    role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
    departmentId: text("department_id"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("memberships_org_user").on(t.organizationId, t.userId)],
);

export const sessions = sqliteTable("sessions", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: text("user_id").notNull().references(() => users.id),
  activeOrganizationId: text("active_organization_id").references(() => organizations.id),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull(),
});

export const invites = sqliteTable("invites", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  email: text("email"),
  role: text("role", { enum: ["admin", "member"] }).notNull(),
  departmentId: text("department_id"),
  tokenHash: text("token_hash").notNull().unique(),
  createdBy: text("created_by").notNull().references(() => users.id),
  expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"),
  acceptedBy: text("accepted_by"),
  createdAt: ts("created_at").notNull(),
});

export const departments = sqliteTable(
  "departments",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("departments_org_name").on(t.organizationId, t.name)],
);

export const workflows = sqliteTable(
  "workflows",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    departmentId: text("department_id").references(() => departments.id),
    name: text("name").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("workflows_org").on(t.organizationId)],
);

// ---------------------------------------------------------------------------
// Tasks (the enterprise's real work)
// ---------------------------------------------------------------------------

export const tasks = sqliteTable(
  "tasks",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    departmentId: text("department_id").references(() => departments.id),
    workflowId: text("workflow_id").references(() => workflows.id),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status", { enum: ["active", "draft", "archived"] }).notNull().default("active"),
    tags: json<string[]>("tags").notNull().default([]),
    currentVersionId: text("current_version_id"),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [index("tasks_org").on(t.organizationId, t.updatedAt)],
);

/** Immutable snapshot of a task definition. Edits create a new version. */
export const taskVersions = sqliteTable(
  "task_versions",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    taskId: text("task_id").notNull().references(() => tasks.id),
    version: integer("version").notNull(),
    instructions: text("instructions").notNull(),
    inputText: text("input_text").notNull().default(""),
    maxOutputTokens: integer("max_output_tokens").notNull(),
    /** Hash over instructions, input and file hashes. Identical content ⇒ identical hash. */
    contentHash: text("content_hash").notNull(),
    changeNote: text("change_note"),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("task_versions_task_version").on(t.taskId, t.version)],
);

/** Files attached to one task version. Bytes live encrypted in file storage. */
export const taskFiles = sqliteTable(
  "task_files",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    taskVersionId: text("task_version_id").notNull().references(() => taskVersions.id),
    role: text("role", { enum: ["input", "reference"] }).notNull(),
    position: integer("position").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    /** How the file is delivered to models: as extracted text, or as a native image part. */
    kind: text("kind", { enum: ["text", "image"] }).notNull(),
    extractedText: text("extracted_text"),
    extractionMethod: text("extraction_method").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("task_files_version").on(t.taskVersionId)],
);

// ---------------------------------------------------------------------------
// Public model catalogue
// ---------------------------------------------------------------------------

/** Model developers (Anthropic, OpenAI, Z.ai, ...). Not inference routes. */
export const providers = sqliteTable("providers", {
  id: id(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  createdAt: ts("created_at").notNull(),
});

export const models = sqliteTable("models", {
  /** Stable catalogue key, e.g. "claude-opus-5.5@max". */
  id: id(),
  providerId: text("provider_id").notNull().references(() => providers.id),
  name: text("name").notNull(),
  /** Configuration label as published by the reference source, e.g. "max, with fallback". */
  variant: text("variant"),
  weights: text("weights", { enum: ["open", "closed", "unknown"] }).notNull(),
  contextLength: integer("context_length"),
  maxOutputTokens: integer("max_output_tokens"),
  inputModalities: json<string[]>("input_modalities").notNull().default(["text"]),
  reasoningEffort: text("reasoning_effort"),
  status: text("status", { enum: ["available", "pricing_unavailable", "unavailable", "deprecated"] }).notNull(),
  statusReason: text("status_reason"),
  currentVersionId: text("current_version_id"),
  currentPricingSnapshotId: text("current_pricing_snapshot_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  description: text("description"),
  firstSeenAt: ts("first_seen_at").notNull(),
  lastSeenAt: ts("last_seen_at"),
  updatedAt: ts("updated_at").notNull(),
});

/** Append-only: a new row whenever the upstream model identity or its run configuration changes. */
export const modelVersions = sqliteTable(
  "model_versions",
  {
    id: id(),
    modelId: text("model_id").notNull().references(() => models.id),
    /** Upstream canonical identifier, e.g. "anthropic/claude-opus-5.5-20260921". */
    upstreamId: text("upstream_id"),
    config: json<Record<string, unknown>>("config").notNull(),
    configHash: text("config_hash").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("model_versions_hash").on(t.modelId, t.configHash)],
);

/** How a model can be executed. Several inference providers may serve one model. */
export const modelRoutes = sqliteTable(
  "model_routes",
  {
    id: id(),
    modelId: text("model_id").notNull().references(() => models.id),
    inferenceProvider: text("inference_provider").notNull(),
    providerModelId: text("provider_model_id").notNull(),
    params: json<Record<string, unknown>>("params").notNull().default({}),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [uniqueIndex("model_routes_model_provider").on(t.modelId, t.inferenceProvider)],
);

/**
 * Append-only pricing history. Rates are decimal strings in USD per 1M tokens so
 * that cost math never passes through binary floating point.
 */
export const modelPricingSnapshots = sqliteTable(
  "model_pricing_snapshots",
  {
    id: id(),
    modelId: text("model_id").notNull().references(() => models.id),
    currency: text("currency").notNull().default("USD"),
    inputPerMTok: text("input_per_mtok").notNull(),
    outputPerMTok: text("output_per_mtok").notNull(),
    cacheReadPerMTok: text("cache_read_per_mtok"),
    cacheWritePerMTok: text("cache_write_per_mtok"),
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    contentHash: text("content_hash").notNull(),
    capturedAt: ts("captured_at").notNull(),
  },
  (t) => [index("pricing_model").on(t.modelId, t.capturedAt)],
);

/** Public benchmark / reference numbers. Never mixed with enterprise run results. */
export const modelReferenceData = sqliteTable(
  "model_reference_data",
  {
    id: id(),
    modelId: text("model_id").notNull().references(() => models.id),
    metric: text("metric").notNull(),
    value: real("value").notNull(),
    source: text("source").notNull(),
    sourceVersion: text("source_version"),
    capturedAt: ts("captured_at").notNull(),
  },
  (t) => [index("reference_model_metric").on(t.modelId, t.metric, t.capturedAt)],
);

export const catalogueRefreshes = sqliteTable("catalogue_refreshes", {
  id: id(),
  trigger: text("trigger").notNull(),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull(),
  sources: json<{ name: string; ok: boolean; error?: string; records?: number }[]>("sources").notNull().default([]),
  summary: json<Record<string, unknown>>("summary").notNull().default({}),
  error: text("error"),
  startedAt: ts("started_at").notNull(),
  completedAt: ts("completed_at"),
});

// ---------------------------------------------------------------------------
// Runs (actual measurements)
// ---------------------------------------------------------------------------

export const RUN_STATUSES = ["queued", "running", "completed", "failed", "partial", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const runs = sqliteTable(
  "runs",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    taskId: text("task_id").notNull().references(() => tasks.id),
    taskVersionId: text("task_version_id").notNull().references(() => taskVersions.id),
    /** live = real provider calls; demo = simulated, never presented as a measurement. */
    mode: text("mode", { enum: ["live", "demo"] }).notNull(),
    status: text("status", { enum: RUN_STATUSES }).notNull(),
    /** sha256 of the canonical payload every model in this run must receive. */
    payloadHash: text("payload_hash").notNull(),
    label: text("label"),
    notes: text("notes"),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: ts("created_at").notNull(),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    durationMs: integer("duration_ms"),
    cancelRequestedAt: ts("cancel_requested_at"),
  },
  (t) => [index("runs_org_created").on(t.organizationId, t.createdAt), index("runs_task").on(t.taskId)],
);

export const RUN_MODEL_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;
export type RunModelStatus = (typeof RUN_MODEL_STATUSES)[number];

export type CostBreakdown = {
  currency: string;
  rates: { inputPerMTok: string; outputPerMTok: string; cacheReadPerMTok: string; cacheWritePerMTok: string };
  rateNotes: string[];
  segmentsNanoUsd: { input: number; cacheRead: number; cacheWrite: number; reasoning: number; answer: number };
};

export const runModels = sqliteTable(
  "run_models",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    runId: text("run_id").notNull().references(() => runs.id),
    position: integer("position").notNull(),
    modelId: text("model_id").notNull().references(() => models.id),
    modelVersionId: text("model_version_id").notNull().references(() => modelVersions.id),
    /** Frozen copy of the display identity at run time. */
    modelName: text("model_name").notNull(),
    modelVariant: text("model_variant"),
    providerName: text("provider_name").notNull(),
    providerColor: text("provider_color").notNull(),
    inferenceProvider: text("inference_provider").notNull(),
    providerModelId: text("provider_model_id").notNull(),
    requestParams: json<Record<string, unknown>>("request_params").notNull(),
    status: text("status", { enum: RUN_MODEL_STATUSES }).notNull(),
    queuedAt: ts("queued_at").notNull(),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    /** Wall-clock time of the provider call that produced the output. */
    durationMs: integer("duration_ms"),
    timeToFirstTokenMs: integer("time_to_first_token_ms"),
    attempts: integer("attempts").notNull().default(0),
    // Usage (normalized; see providers/types.ts)
    inputTokens: integer("input_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    outputTokens: integer("output_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    // Cost (integer nano-USD; 1 USD = 1e9)
    costNanoUsd: integer("cost_nano_usd"),
    costSource: text("cost_source", { enum: ["provider_billed", "calculated", "simulated"] }),
    calculatedCostNanoUsd: integer("calculated_cost_nano_usd"),
    providerCostNanoUsd: integer("provider_cost_nano_usd"),
    costBreakdown: json<CostBreakdown>("cost_breakdown"),
    pricingSnapshotId: text("pricing_snapshot_id").references(() => modelPricingSnapshots.id),
    currency: text("currency"),
    costCalculatedAt: ts("cost_calculated_at"),
    // Provenance
    payloadHash: text("payload_hash"),
    providerRequestId: text("provider_request_id"),
    servedBy: text("served_by"),
    finishReason: text("finish_reason"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    providerMeta: json<Record<string, unknown>>("provider_meta"),
  },
  (t) => [index("run_models_run").on(t.runId), index("run_models_org_model").on(t.organizationId, t.modelId)],
);

export const runArtifacts = sqliteTable(
  "run_artifacts",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    runModelId: text("run_model_id").notNull().references(() => runModels.id),
    artifactType: text("artifact_type", { enum: ["text", "markdown", "json", "code"] }).notNull(),
    mimeType: text("mime_type").notNull(),
    content: text("content"),
    storageKey: text("storage_key"),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("run_artifacts_run_model").on(t.runModelId)],
);

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

export const jobs = sqliteTable(
  "jobs",
  {
    id: id(),
    type: text("type").notNull(),
    payload: json<Record<string, unknown>>("payload").notNull(),
    status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull(),
    runAfter: ts("run_after").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lockedBy: text("locked_by"),
    lockedAt: ts("locked_at"),
    lastError: text("last_error"),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [index("jobs_claim").on(t.status, t.runAfter)],
);

/** Billing-agnostic record of variable inference cost per execution. */
export const usageLedger = sqliteTable(
  "usage_ledger",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    runModelId: text("run_model_id").notNull().unique().references(() => runModels.id),
    kind: text("kind").notNull(),
    amountNanoUsd: integer("amount_nano_usd").notNull(),
    currency: text("currency").notNull(),
    billingMode: text("billing_mode").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("usage_ledger_org").on(t.organizationId, t.createdAt)],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: id(),
    organizationId: text("organization_id"),
    userId: text("user_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    meta: json<Record<string, unknown>>("meta").notNull().default({}),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("audit_org").on(t.organizationId, t.createdAt)],
);
