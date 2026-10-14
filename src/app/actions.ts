"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { acceptInvite, authenticate, createSession, destroySession, signUp, switchOrganization } from "@/server/auth/service";
import { clearSessionCookie, getSession, readSessionToken, requireCtx, setSessionCookie } from "@/server/auth/next";
import { ForbiddenError, NotFoundError, ValidationError, requireAdmin } from "@/server/auth/context";
import { processUpload, type ProcessedFile } from "@/server/tasks/files";
import { createTask, setTaskStatus, updateTask, type TaskFileInput } from "@/server/tasks/service";
import { createRun, requestCancel, updateRunNotes } from "@/server/runs/service";
import {
  createInvite,
  ensureDepartment,
  removeMember,
  renameDepartment,
  renameOrganization,
  revokeInvite,
  updateMember,
  updateProfileName,
} from "@/server/orgs/service";
import { refreshCatalogue } from "@/server/catalogue/refresh";
import { lastRefresh } from "@/server/catalogue/service";
import { audit } from "@/server/audit";
import { log } from "@/server/log";

export type ActionState = { error?: string; ok?: string; data?: Record<string, string> } | undefined;

function message(err: unknown): string {
  if (err instanceof ValidationError || err instanceof ForbiddenError || err instanceof NotFoundError) return err.message;
  log.error("action failed", { error: (err as Error)?.message });
  return "Something went wrong. Please try again.";
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const attempts = new Map<string, { n: number; until: number }>();
function throttle(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.n >= 8) throw new ValidationError("Too many attempts. Wait a few minutes and try again.");
  attempts.set(key, a && a.until > now ? { n: a.n + 1, until: a.until } : { n: 1, until: now + 15 * 60_000 });
}

export async function signUpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { userId, organizationId } = await signUp({
      name: str(fd, "name"),
      email: str(fd, "email"),
      password: str(fd, "password"),
      organizationName: str(fd, "organization"),
    });
    await setSessionCookie(createSession(userId, organizationId));
  } catch (err) {
    return { error: message(err), data: { name: str(fd, "name"), email: str(fd, "email"), organization: str(fd, "organization") } };
  }
  redirect("/workspace?welcome=1");
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").trim().toLowerCase();
  const next = str(fd, "next");
  try {
    const ip = (await headers()).get("x-forwarded-for") ?? "local";
    throttle(`${email}|${ip}`);
    const userId = await authenticate(email, str(fd, "password"));
    if (!userId) return { error: "Email or password is incorrect.", data: { email } };
    await setSessionCookie(createSession(userId, null));
    audit({ organizationId: null, userId }, "user.login");
  } catch (err) {
    return { error: message(err), data: { email } };
  }
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/workspace");
}

export async function logoutAction() {
  const token = await readSessionToken();
  if (token) destroySession(token);
  await clearSessionCookie();
  redirect("/login");
}

export async function acceptInviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const token = str(fd, "token");
  try {
    const session = await getSession();
    if (session) {
      const { organizationId } = await acceptInvite(token, { userId: session.user.id });
      switchOrganization(session.sessionId, session.user.id, organizationId);
    } else {
      const { userId, organizationId } = await acceptInvite(token, { name: str(fd, "name"), email: str(fd, "email"), password: str(fd, "password") });
      await setSessionCookie(createSession(userId, organizationId));
    }
  } catch (err) {
    return { error: message(err), data: { name: str(fd, "name"), email: str(fd, "email") } };
  }
  redirect("/workspace");
}

export async function switchOrgAction(fd: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  switchOrganization(session.sessionId, session.user.id, str(fd, "organizationId"));
  redirect("/workspace");
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

async function collectFiles(fd: FormData): Promise<TaskFileInput[]> {
  const files = fd.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0);
  const roles = fd.getAll("fileRoles").map(String);
  const out: TaskFileInput[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const processed: ProcessedFile = await processUpload(f.name, f.type, Buffer.from(await f.arrayBuffer()));
    out.push({ ...processed, role: roles[i] === "reference" ? "reference" : "input" });
  }
  return out;
}

function definitionFrom(fd: FormData) {
  const max = Number(str(fd, "maxOutputTokens") || "32000");
  return {
    name: str(fd, "name"),
    description: str(fd, "description"),
    departmentName: str(fd, "departmentName"),
    workflowName: str(fd, "workflowName"),
    tags: str(fd, "tags").split(","),
    instructions: str(fd, "instructions"),
    inputText: str(fd, "inputText"),
    maxOutputTokens: Number.isFinite(max) ? Math.round(max) : NaN,
  };
}

function echo(fd: FormData) {
  const d: Record<string, string> = {};
  for (const k of ["name", "description", "departmentName", "workflowName", "tags", "instructions", "inputText", "maxOutputTokens", "changeNote"]) d[k] = str(fd, k);
  return d;
}

export async function createTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx } = await requireCtx();
  let taskId: string;
  try {
    const files = await collectFiles(fd);
    ({ taskId } = await createTask(ctx, definitionFrom(fd), files));
  } catch (err) {
    return { error: message(err), data: echo(fd) };
  }
  revalidatePath("/tasks");
  redirect(str(fd, "intent") === "run" ? `/tasks/${taskId}/run` : `/tasks/${taskId}`);
}

export async function updateTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx } = await requireCtx();
  const taskId = str(fd, "taskId");
  try {
    const keepFileIds = fd.getAll("keepFileIds").map(String);
    const keepFileRoles: Record<string, "input" | "reference"> = {};
    for (const id of keepFileIds) keepFileRoles[id] = str(fd, `keepRole_${id}`) === "reference" ? "reference" : "input";
    const files = await collectFiles(fd);
    await updateTask(ctx, taskId, { ...definitionFrom(fd), keepFileIds, keepFileRoles, changeNote: str(fd, "changeNote") }, files);
  } catch (err) {
    return { error: message(err), data: echo(fd) };
  }
  revalidatePath(`/tasks/${taskId}`);
  redirect(str(fd, "intent") === "run" ? `/tasks/${taskId}/run` : `/tasks/${taskId}`);
}

export async function setTaskStatusAction(fd: FormData) {
  const { ctx } = await requireCtx();
  const taskId = str(fd, "taskId");
  setTaskStatus(ctx, taskId, str(fd, "status") === "archived" ? "archived" : "active");
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export async function createRunAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx } = await requireCtx();
  let runId: string;
  try {
    ({ runId } = await createRun(ctx, {
      taskId: str(fd, "taskId"),
      taskVersionId: str(fd, "taskVersionId") || undefined,
      modelIds: fd.getAll("modelIds").map(String),
      mode: str(fd, "mode") === "live" ? "live" : "demo",
      label: str(fd, "label"),
    }));
  } catch (err) {
    return { error: message(err) };
  }
  redirect(`/runs/${runId}`);
}

export async function cancelRunAction(fd: FormData) {
  const { ctx } = await requireCtx();
  requestCancel(ctx, str(fd, "runId"));
  revalidatePath(`/runs/${str(fd, "runId")}`);
}

export async function updateRunNotesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx } = await requireCtx();
  try {
    updateRunNotes(ctx, str(fd, "runId"), { label: str(fd, "label"), notes: str(fd, "notes") });
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath(`/runs/${str(fd, "runId")}`);
  return { ok: "Saved" };
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export async function createInviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx } = await requireCtx();
  try {
    const { token } = createInvite(ctx, {
      role: str(fd, "role") === "admin" ? "admin" : "member",
      email: str(fd, "email"),
      departmentId: str(fd, "departmentId") || null,
    });
    revalidatePath("/team");
    return { ok: "Invite link created", data: { token } };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function revokeInviteAction(fd: FormData) {
  const { ctx } = await requireCtx();
  revokeInvite(ctx, str(fd, "inviteId"));
  revalidatePath("/team");
}

export async function updateMemberAction(fd: FormData) {
  const { ctx } = await requireCtx();
  const patch: { role?: "owner" | "admin" | "member"; departmentId?: string | null } = {};
  const role = str(fd, "role");
  if (role === "owner" || role === "admin" || role === "member") patch.role = role;
  if (fd.has("departmentId")) patch.departmentId = str(fd, "departmentId") || null;
  try {
    updateMember(ctx, str(fd, "membershipId"), patch);
  } catch (err) {
    log.warn("member update rejected", { error: (err as Error).message });
  }
  revalidatePath("/team");
}

export async function removeMemberAction(fd: FormData) {
  const { ctx } = await requireCtx();
  try {
    removeMember(ctx, str(fd, "membershipId"));
  } catch (err) {
    log.warn("member removal rejected", { error: (err as Error).message });
  }
  revalidatePath("/team");
}

export async function createDepartmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx } = await requireCtx();
  const name = str(fd, "name").trim();
  if (!name) return { error: "Enter a department name." };
  ensureDepartment(ctx, name);
  revalidatePath("/team");
  return { ok: `${name} added` };
}

export async function renameDepartmentAction(fd: FormData) {
  const { ctx } = await requireCtx();
  try {
    renameDepartment(ctx, str(fd, "departmentId"), str(fd, "name"));
  } catch (err) {
    log.warn("department rename rejected", { error: (err as Error).message });
  }
  revalidatePath("/team");
}

export async function renameOrgAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx } = await requireCtx();
  try {
    renameOrganization(ctx, str(fd, "name"));
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx } = await requireCtx();
  try {
    updateProfileName(ctx, str(fd, "name"));
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export async function refreshCatalogueAction(): Promise<ActionState> {
  const { ctx } = await requireCtx();
  try {
    requireAdmin(ctx);
    const last = lastRefresh();
    if (last && last.status === "running" && Date.now() - last.startedAt < 120_000) return { error: "A refresh is already running." };
    if (last && Date.now() - last.startedAt < 60_000) return { error: "The catalogue was refreshed less than a minute ago." };
    const res = await refreshCatalogue({ trigger: `manual:${ctx.userId}` });
    revalidatePath("/models");
    revalidatePath("/settings");
    const failed = res.sources.filter((s) => !s.ok);
    if (failed.length) return { error: `Refreshed with errors: ${failed.map((f) => `${f.name}: ${f.error}`).join("; ")}` };
    return { ok: `Catalogue refreshed · ${res.summary.priceChanges.length} price change(s)` };
  } catch (err) {
    return { error: message(err) };
  }
}
