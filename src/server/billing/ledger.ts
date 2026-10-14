/**
 * Billing layer, deliberately strategy-agnostic. Every live execution writes one
 * ledger entry with its actual inference cost. Whether that cost is passed
 * through at cost or bundled into platform usage is an organization setting read
 * at invoicing time; the measured cost shown to users never changes.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import * as s from "../db/schema";
import { newId } from "../ids";

export function recordUsage(db: DB, organizationId: string, runModelId: string, amountNanoUsd: number, currency: string) {
  const org = db.select({ billingMode: s.organizations.billingMode }).from(s.organizations).where(eq(s.organizations.id, organizationId)).get();
  db.insert(s.usageLedger)
    .values({
      id: newId("led"),
      organizationId,
      runModelId,
      kind: "inference",
      amountNanoUsd,
      currency,
      billingMode: org?.billingMode ?? "passthrough",
      createdAt: Date.now(),
    })
    .onConflictDoNothing()
    .run();
}

export function inferenceSpendSince(db: DB, organizationId: string, since: number) {
  return (
    db
      .select({ total: sql<number>`coalesce(sum(${s.usageLedger.amountNanoUsd}), 0)`, n: sql<number>`count(*)` })
      .from(s.usageLedger)
      .where(and(eq(s.usageLedger.organizationId, organizationId), gte(s.usageLedger.createdAt, since)))
      .get() ?? { total: 0, n: 0 }
  );
}
