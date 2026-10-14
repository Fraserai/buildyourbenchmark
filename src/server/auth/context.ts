/**
 * Tenant context. Every service that touches enterprise data takes a Ctx and
 * scopes every query by ctx.organizationId. A Ctx can only be produced from a
 * verified session + membership (or explicitly in tests/scripts).
 */
export type Role = "owner" | "admin" | "member";

export type Ctx = {
  userId: string;
  organizationId: string;
  role: Role;
};

export class NotFoundError extends Error {
  constructor(what = "Not found") {
    super(what);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(what = "Forbidden") {
    super(what);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function requireAdmin(ctx: Ctx) {
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new ForbiddenError("Only organization admins can do this.");
}
