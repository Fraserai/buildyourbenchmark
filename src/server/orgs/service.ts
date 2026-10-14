import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import * as s from "../db/schema";
import { newId, sha256 } from "../ids";
import { audit } from "../audit";
import { randomToken } from "../security/crypto";
import { NotFoundError, ValidationError, requireAdmin, type Ctx, type Role } from "../auth/context";

export function getOrganization(ctx: Ctx) {
  const org = getDb().select().from(s.organizations).where(eq(s.organizations.id, ctx.organizationId)).get();
  if (!org) throw new NotFoundError("Organization not found");
  return org;
}

export function renameOrganization(ctx: Ctx, name: string) {
  requireAdmin(ctx);
  if (!name.trim()) throw new ValidationError("Organization name cannot be empty.");
  getDb().update(s.organizations).set({ name: name.trim() }).where(eq(s.organizations.id, ctx.organizationId)).run();
  audit(ctx, "organization.renamed", { type: "organization", id: ctx.organizationId });
}

// --- Departments & workflows (optional hierarchy; anyone can create) -----------

export function ensureDepartment(ctx: Ctx, name: string): string {
  const db = getDb();
  const clean = name.trim().slice(0, 100);
  const existing = db
    .select()
    .from(s.departments)
    .where(and(eq(s.departments.organizationId, ctx.organizationId), sql`lower(${s.departments.name}) = lower(${clean})`))
    .get();
  if (existing) return existing.id;
  const id = newId("dept");
  db.insert(s.departments).values({ id, organizationId: ctx.organizationId, name: clean, createdAt: Date.now() }).run();
  audit(ctx, "department.created", { type: "department", id });
  return id;
}

export function ensureWorkflow(ctx: Ctx, name: string, departmentId: string | null): string {
  const db = getDb();
  const clean = name.trim().slice(0, 100);
  const existing = db
    .select()
    .from(s.workflows)
    .where(
      and(
        eq(s.workflows.organizationId, ctx.organizationId),
        departmentId ? eq(s.workflows.departmentId, departmentId) : isNull(s.workflows.departmentId),
        sql`lower(${s.workflows.name}) = lower(${clean})`,
      ),
    )
    .get();
  if (existing) return existing.id;
  const id = newId("wf");
  db.insert(s.workflows).values({ id, organizationId: ctx.organizationId, departmentId, name: clean, createdAt: Date.now() }).run();
  return id;
}

export function listDepartments(ctx: Ctx) {
  const db = getDb();
  const depts = db.select().from(s.departments).where(eq(s.departments.organizationId, ctx.organizationId)).orderBy(asc(s.departments.name)).all();
  const counts = db
    .select({ departmentId: s.tasks.departmentId, n: sql<number>`count(*)` })
    .from(s.tasks)
    .where(and(eq(s.tasks.organizationId, ctx.organizationId), eq(s.tasks.status, "active")))
    .groupBy(s.tasks.departmentId)
    .all();
  const members = db
    .select({ departmentId: s.memberships.departmentId, n: sql<number>`count(*)` })
    .from(s.memberships)
    .where(eq(s.memberships.organizationId, ctx.organizationId))
    .groupBy(s.memberships.departmentId)
    .all();
  const workflows = db.select().from(s.workflows).where(eq(s.workflows.organizationId, ctx.organizationId)).orderBy(asc(s.workflows.name)).all();
  return depts.map((d) => ({
    ...d,
    taskCount: counts.find((c) => c.departmentId === d.id)?.n ?? 0,
    memberCount: members.find((m) => m.departmentId === d.id)?.n ?? 0,
    workflows: workflows.filter((w) => w.departmentId === d.id),
  }));
}

export function listWorkflowNames(ctx: Ctx) {
  return getDb()
    .select({ name: s.workflows.name, departmentName: s.departments.name })
    .from(s.workflows)
    .leftJoin(s.departments, eq(s.departments.id, s.workflows.departmentId))
    .where(eq(s.workflows.organizationId, ctx.organizationId))
    .orderBy(asc(s.workflows.name))
    .all();
}

export function renameDepartment(ctx: Ctx, departmentId: string, name: string) {
  requireAdmin(ctx);
  if (!name.trim()) throw new ValidationError("Department name cannot be empty.");
  const res = getDb()
    .update(s.departments)
    .set({ name: name.trim() })
    .where(and(eq(s.departments.id, departmentId), eq(s.departments.organizationId, ctx.organizationId)))
    .run();
  if (res.changes === 0) throw new NotFoundError("Department not found");
}

// --- Members & invites ------------------------------------------------------------

export function listMembers(ctx: Ctx) {
  return getDb()
    .select({
      membershipId: s.memberships.id,
      userId: s.users.id,
      name: s.users.name,
      email: s.users.email,
      role: s.memberships.role,
      departmentId: s.memberships.departmentId,
      joinedAt: s.memberships.createdAt,
    })
    .from(s.memberships)
    .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
    .where(eq(s.memberships.organizationId, ctx.organizationId))
    .orderBy(asc(s.users.name))
    .all();
}

export function updateMember(ctx: Ctx, membershipId: string, patch: { role?: Role; departmentId?: string | null }) {
  const db = getDb();
  const m = db
    .select()
    .from(s.memberships)
    .where(and(eq(s.memberships.id, membershipId), eq(s.memberships.organizationId, ctx.organizationId)))
    .get();
  if (!m) throw new NotFoundError("Member not found");
  const self = m.userId === ctx.userId;
  if (patch.role !== undefined) {
    requireAdmin(ctx);
    if (m.role === "owner" && patch.role !== "owner") {
      const owners = db
        .select({ n: sql<number>`count(*)` })
        .from(s.memberships)
        .where(and(eq(s.memberships.organizationId, ctx.organizationId), eq(s.memberships.role, "owner")))
        .get()!.n;
      if (owners <= 1) throw new ValidationError("An organization needs at least one owner.");
    }
    if (patch.role === "owner" && ctx.role !== "owner") throw new ValidationError("Only owners can grant ownership.");
  }
  if (patch.departmentId !== undefined && !self) requireAdmin(ctx);
  if (patch.departmentId) {
    const d = db
      .select()
      .from(s.departments)
      .where(and(eq(s.departments.id, patch.departmentId), eq(s.departments.organizationId, ctx.organizationId)))
      .get();
    if (!d) throw new NotFoundError("Department not found");
  }
  db.update(s.memberships).set(patch).where(eq(s.memberships.id, membershipId)).run();
  audit(ctx, "member.updated", { type: "membership", id: membershipId }, { role: patch.role });
}

export function removeMember(ctx: Ctx, membershipId: string) {
  requireAdmin(ctx);
  const db = getDb();
  const m = db
    .select()
    .from(s.memberships)
    .where(and(eq(s.memberships.id, membershipId), eq(s.memberships.organizationId, ctx.organizationId)))
    .get();
  if (!m) throw new NotFoundError("Member not found");
  if (m.role === "owner") throw new ValidationError("Transfer ownership before removing an owner.");
  db.delete(s.memberships).where(eq(s.memberships.id, membershipId)).run();
  audit(ctx, "member.removed", { type: "membership", id: membershipId });
}

/** Create a single-use invite link. The raw token is returned once and only its hash is stored. */
export function createInvite(ctx: Ctx, input: { role: "admin" | "member"; email?: string | null; departmentId?: string | null }) {
  requireAdmin(ctx);
  const token = randomToken(24);
  const id = newId("inv");
  getDb()
    .insert(s.invites)
    .values({
      id,
      organizationId: ctx.organizationId,
      email: input.email?.trim().toLowerCase() || null,
      role: input.role,
      departmentId: input.departmentId || null,
      tokenHash: sha256(token),
      createdBy: ctx.userId,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      createdAt: Date.now(),
    })
    .run();
  audit(ctx, "invite.created", { type: "invite", id }, { role: input.role });
  return { id, token };
}

export function listInvites(ctx: Ctx) {
  return getDb()
    .select()
    .from(s.invites)
    .where(and(eq(s.invites.organizationId, ctx.organizationId), isNull(s.invites.acceptedAt)))
    .orderBy(desc(s.invites.createdAt))
    .all()
    .filter((i) => i.expiresAt > Date.now());
}

export function revokeInvite(ctx: Ctx, inviteId: string) {
  requireAdmin(ctx);
  getDb()
    .delete(s.invites)
    .where(and(eq(s.invites.id, inviteId), eq(s.invites.organizationId, ctx.organizationId), isNull(s.invites.acceptedAt)))
    .run();
}

export function updateProfileName(ctx: Ctx, name: string) {
  if (!name.trim()) throw new ValidationError("Name cannot be empty.");
  getDb().update(s.users).set({ name: name.trim() }).where(eq(s.users.id, ctx.userId)).run();
}

export function workspaceStats(ctx: Ctx) {
  const db = getDb();
  const one = (q: { n: number } | undefined) => q?.n ?? 0;
  return {
    tasks: one(db.select({ n: sql<number>`count(*)` }).from(s.tasks).where(and(eq(s.tasks.organizationId, ctx.organizationId), eq(s.tasks.status, "active"))).get()),
    departments: one(db.select({ n: sql<number>`count(*)` }).from(s.departments).where(eq(s.departments.organizationId, ctx.organizationId)).get()),
    runs: one(db.select({ n: sql<number>`count(*)` }).from(s.runs).where(eq(s.runs.organizationId, ctx.organizationId)).get()),
    executions: one(db.select({ n: sql<number>`count(*)` }).from(s.runModels).where(eq(s.runModels.organizationId, ctx.organizationId)).get()),
    members: one(db.select({ n: sql<number>`count(*)` }).from(s.memberships).where(eq(s.memberships.organizationId, ctx.organizationId)).get()),
  };
}
