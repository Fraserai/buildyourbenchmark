import { beforeEach, describe, expect, it } from "vitest";
import { createTask, getTask, getTaskFile, getTaskVersion, listTasks, updateTask } from "@/server/tasks/service";
import { createRun, getArtifact, getRun, listRuns, requestCancel } from "@/server/runs/service";
import { listMembers, updateMember, createInvite } from "@/server/orgs/service";
import { processUpload } from "@/server/tasks/files";
import { drainQueue } from "@/server/jobs/worker";
import { listCatalogue } from "@/server/catalogue/service";
import { NotFoundError, ForbiddenError, type Ctx } from "@/server/auth/context";
import { ScriptedProvider, freshDb, installProviders, makeOrg, seedCatalogue } from "./helpers";

let a: Ctx;
let b: Ctx;
beforeEach(async () => {
  freshDb();
  installProviders(new ScriptedProvider("openrouter"));
  await seedCatalogue();
  a = await makeOrg("Coles");
  b = await makeOrg("Morris Blackburn");
});

describe("tenant isolation", () => {
  it("never exposes one organization's tasks, files, runs or outputs to another", async () => {
    const file = await processUpload("complaint.txt", "text/plain", Buffer.from("secret complaint"));
    const { taskId, versionId } = await createTask(a, { name: "Customer complaint", instructions: "Respond", inputText: "confidential" }, [{ ...file, role: "input" }]);
    const { runId } = await createRun(a, { taskId, modelIds: ["glm-5.3@max"], mode: "live" });
    await drainQueue();
    const run = getRun(a, runId);
    const artifactId = run.models[0].artifact!.id;
    const fileId = getTaskVersion(a, versionId).files[0].id;

    expect(() => getTask(b, taskId)).toThrow(NotFoundError);
    expect(() => getTaskVersion(b, versionId)).toThrow(NotFoundError);
    expect(() => getTaskFile(b, fileId)).toThrow(NotFoundError);
    expect(() => getRun(b, runId)).toThrow(NotFoundError);
    expect(() => getArtifact(b, artifactId)).toThrow(NotFoundError);
    expect(() => requestCancel(b, runId)).toThrow(NotFoundError);
    await expect(updateTask(b, taskId, { name: "x", instructions: "y", keepFileIds: [] })).rejects.toThrow(NotFoundError);
    await expect(createRun(b, { taskId, modelIds: ["glm-5.3@max"], mode: "live" })).rejects.toThrow(NotFoundError);
    expect(listTasks(b)).toHaveLength(0);
    expect(listRuns(b)).toHaveLength(0);
    expect(listCatalogue(b).every((m) => m.ownCompletedRuns === 0)).toBe(true);
    expect(listCatalogue(a).find((m) => m.id === "glm-5.3@max")!.ownCompletedRuns).toBe(1);
  });

  it("cannot run another org's task version through its own task", async () => {
    const other = await createTask(a, { name: "A task", instructions: "x" });
    const mine = await createTask(b, { name: "B task", instructions: "y" });
    await expect(createRun(b, { taskId: mine.taskId, taskVersionId: other.versionId, modelIds: ["glm-5.3@max"], mode: "live" })).rejects.toThrow(NotFoundError);
  });

  it("scopes membership management to the organization", async () => {
    const bMember = listMembers(b)[0];
    expect(() => updateMember(a, bMember.membershipId, { role: "member" })).toThrow(NotFoundError);
    expect(listMembers(a).map((m) => m.userId)).not.toContain(b.userId);
  });

  it("requires admin rights for admin-only actions", () => {
    const member: Ctx = { ...a, role: "member" };
    expect(() => createInvite(member, { role: "member" })).toThrow(ForbiddenError);
  });
});
