import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveSession, SESSION_TTL_MS, type SessionInfo } from "./service";
import type { Ctx } from "./context";

export const SESSION_COOKIE = "wb_session";

export async function getSession(): Promise<SessionInfo | null> {
  const jar = await cookies();
  return resolveSession(jar.get(SESSION_COOKIE)?.value);
}

/** For pages and actions that need an authenticated tenant context. */
export async function requireCtx(): Promise<{ session: SessionInfo; ctx: Ctx }> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.ctx) redirect("/login?reason=no-organization");
  return { session, ctx: session.ctx };
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function readSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
