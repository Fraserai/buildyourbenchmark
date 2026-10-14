import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import * as s from "../db/schema";
import { newId, sha256 } from "../ids";
import { randomToken } from "../security/crypto";
import { audit } from "../audit";
import { hashPassword, verifyPassword } from "./password";
import { ValidationError, type Ctx, type Role } from "./context";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function validateCredentials(email: string, password: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError("Enter a valid email address.");
  if (password.length < 10) throw new ValidationError("Password must be at least 10 characters.");
}

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "org"
  );
}

function uniqueSlug(base: string) {
  const db = getDb();
  let slug = base;
  for (let i = 2; db.select({ id: s.organizations.id }).from(s.organizations).where(eq(s.organizations.slug, slug)).get(); i++) {
    slug = `${base}-${i}`;
  }
  return slug;
}

/** Self-serve sign up: creates the user, their organization and an owner membership. */
export async function signUp(input: { name: string; email: string; password: string; organizationName: string }) {
  const email = normalizeEmail(input.email);
  validateCredentials(email, input.password);
  if (!input.name.trim()) throw new ValidationError("Enter your name.");
  if (!input.organizationName.trim()) throw new ValidationError("Enter your organization's name.");
  const db = getDb();
  if (db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email)).get()) {
    throw new ValidationError("An account with this email already exists. Sign in instead.");
  }
  const passwordHash = await hashPassword(input.password);
  const now = Date.now();
  const userId = newId("usr");
  const organizationId = newId("org");
  db.transaction((tx) => {
    tx.insert(s.users).values({ id: userId, email, name: input.name.trim(), passwordHash, createdAt: now }).run();
    tx.insert(s.organizations)
      .values({ id: organizationId, name: input.organizationName.trim(), slug: uniqueSlug(slugify(input.organizationName)), createdAt: now })
      .run();
    tx.insert(s.memberships).values({ id: newId("mem"), organizationId, userId, role: "owner", createdAt: now }).run();
  });
  audit({ organizationId, userId }, "organization.created", { type: "organization", id: organizationId });
  return { userId, organizationId };
}

/** Constant-work login check. Returns the user id or null. */
export async function authenticate(emailRaw: string, password: string): Promise<string | null> {
  const email = normalizeEmail(emailRaw);
  const user = getDb().select().from(s.users).where(eq(s.users.email, email)).get();
  // Verify against a dummy hash when the user doesn't exist to keep timing uniform.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  return user && ok ? user.id : null;
}

const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

export function createSession(userId: string, organizationId: string | null): string {
  const token = randomToken(32);
  const now = Date.now();
  getDb()
    .insert(s.sessions)
    .values({ id: newId("ses"), tokenHash: sha256(token), userId, activeOrganizationId: organizationId, expiresAt: now + SESSION_TTL_MS, createdAt: now })
    .run();
  return token;
}

export function destroySession(token: string) {
  getDb().delete(s.sessions).where(eq(s.sessions.tokenHash, sha256(token))).run();
}

export type SessionInfo = {
  sessionId: string;
  user: { id: string; name: string; email: string };
  ctx: Ctx | null;
  organizations: { id: string; name: string; role: Role }[];
};

/** Resolve a session token to the user, their memberships and the active tenant context. */
export function resolveSession(token: string | undefined): SessionInfo | null {
  if (!token) return null;
  const db = getDb();
  const session = db
    .select()
    .from(s.sessions)
    .where(and(eq(s.sessions.tokenHash, sha256(token)), gt(s.sessions.expiresAt, Date.now())))
    .get();
  if (!session) return null;
  const user = db.select().from(s.users).where(eq(s.users.id, session.userId)).get();
  if (!user) return null;
  const orgs = db
    .select({ id: s.organizations.id, name: s.organizations.name, role: s.memberships.role })
    .from(s.memberships)
    .innerJoin(s.organizations, eq(s.organizations.id, s.memberships.organizationId))
    .where(eq(s.memberships.userId, user.id))
    .all();
  const active = orgs.find((o) => o.id === session.activeOrganizationId) ?? orgs[0];
  return {
    sessionId: session.id,
    user: { id: user.id, name: user.name, email: user.email },
    ctx: active ? { userId: user.id, organizationId: active.id, role: active.role } : null,
    organizations: orgs,
  };
}

export function switchOrganization(sessionId: string, userId: string, organizationId: string) {
  const db = getDb();
  const membership = db
    .select()
    .from(s.memberships)
    .where(and(eq(s.memberships.userId, userId), eq(s.memberships.organizationId, organizationId)))
    .get();
  if (!membership) throw new ValidationError("You are not a member of that organization.");
  db.update(s.sessions).set({ activeOrganizationId: organizationId }).where(eq(s.sessions.id, sessionId)).run();
}

// --- Invites -------------------------------------------------------------------

export function findInvite(token: string) {
  return getDb()
    .select({ invite: s.invites, organizationName: s.organizations.name })
    .from(s.invites)
    .innerJoin(s.organizations, eq(s.organizations.id, s.invites.organizationId))
    .where(and(eq(s.invites.tokenHash, sha256(token)), isNull(s.invites.acceptedAt), gt(s.invites.expiresAt, Date.now())))
    .get();
}

/** Accept an invite as a new user (name/email/password) or as an existing signed-in user. */
export async function acceptInvite(token: string, as: { userId: string } | { name: string; email: string; password: string }) {
  const found = findInvite(token);
  if (!found) throw new ValidationError("This invite link is invalid or has expired.");
  const { invite } = found;
  const db = getDb();
  let userId: string;
  if ("userId" in as) {
    userId = as.userId;
  } else {
    const email = normalizeEmail(as.email);
    validateCredentials(email, as.password);
    if (invite.email && invite.email !== email) throw new ValidationError("This invite was issued for a different email address.");
    if (db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email)).get()) {
      throw new ValidationError("An account with this email already exists. Sign in first, then open the invite link.");
    }
    userId = newId("usr");
    db.insert(s.users).values({ id: userId, email, name: as.name.trim() || email, passwordHash: await hashPassword(as.password), createdAt: Date.now() }).run();
  }
  const existing = db
    .select()
    .from(s.memberships)
    .where(and(eq(s.memberships.userId, userId), eq(s.memberships.organizationId, invite.organizationId)))
    .get();
  db.transaction((tx) => {
    if (!existing) {
      tx.insert(s.memberships)
        .values({ id: newId("mem"), organizationId: invite.organizationId, userId, role: invite.role, departmentId: invite.departmentId, createdAt: Date.now() })
        .run();
    }
    tx.update(s.invites).set({ acceptedAt: Date.now(), acceptedBy: userId }).where(eq(s.invites.id, invite.id)).run();
  });
  audit({ organizationId: invite.organizationId, userId }, "member.joined", { type: "invite", id: invite.id });
  return { userId, organizationId: invite.organizationId };
}
