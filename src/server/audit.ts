import { getDb } from "./db/client";
import { auditEvents } from "./db/schema";
import { newId } from "./ids";

/** Append-only audit trail. Metadata must never contain task content. */
export function audit(
  ctx: { organizationId: string | null; userId: string | null },
  action: string,
  target?: { type: string; id: string },
  meta: Record<string, unknown> = {},
) {
  getDb()
    .insert(auditEvents)
    .values({
      id: newId("aud"),
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action,
      targetType: target?.type ?? null,
      targetId: target?.id ?? null,
      meta,
      createdAt: Date.now(),
    })
    .run();
}
