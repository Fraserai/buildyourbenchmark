import { beforeEach, describe, expect, it } from "vitest";
import { acceptInvite, authenticate, createSession, resolveSession, signUp, destroySession } from "@/server/auth/service";
import { createInvite, listMembers } from "@/server/orgs/service";
import { freshDb, makeOrg } from "./helpers";

beforeEach(() => {
  freshDb();
});

describe("auth", () => {
  it("signs up, authenticates and resolves a session to a tenant context", async () => {
    const { userId, organizationId } = await signUp({ name: "Ada", email: "Ada@Coles.test", password: "a-long-password", organizationName: "Coles" });
    expect(await authenticate("ada@coles.test", "a-long-password")).toBe(userId);
    expect(await authenticate("ada@coles.test", "wrong-password")).toBeNull();
    expect(await authenticate("nobody@coles.test", "a-long-password")).toBeNull();
    const token = createSession(userId, organizationId);
    const session = resolveSession(token)!;
    expect(session.ctx).toEqual({ userId, organizationId, role: "owner" });
    destroySession(token);
    expect(resolveSession(token)).toBeNull();
  });

  it("rejects weak passwords and duplicate emails", async () => {
    await expect(signUp({ name: "A", email: "a@b.test", password: "short", organizationName: "X" })).rejects.toThrow();
    await signUp({ name: "A", email: "a@b.test", password: "long-enough-pw", organizationName: "X" });
    await expect(signUp({ name: "A", email: "A@b.test", password: "long-enough-pw", organizationName: "Y" })).rejects.toThrow(/exists/);
  });

  it("lets a teammate join through a single-use invite", async () => {
    const owner = await makeOrg("Morris Blackburn");
    const { token } = createInvite(owner, { role: "member" });
    const { userId } = await acceptInvite(token, { name: "Lee", email: "lee@mb.test", password: "another-long-pw" });
    const members = listMembers(owner);
    expect(members.find((m) => m.userId === userId)?.role).toBe("member");
    await expect(acceptInvite(token, { name: "Eve", email: "eve@mb.test", password: "another-long-pw" })).rejects.toThrow(/invalid or has expired/);
  });
});
