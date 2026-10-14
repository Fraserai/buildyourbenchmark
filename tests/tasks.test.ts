import { beforeEach, describe, expect, it } from "vitest";
import { createTask, getTask, getTaskVersion, listTasks, updateTask } from "@/server/tasks/service";
import { processUpload } from "@/server/tasks/files";
import { buildPayloadForVersion } from "@/server/tasks/payload";
import { getDb } from "@/server/db/client";
import { freshDb, makeOrg } from "./helpers";
import type { Ctx } from "@/server/auth/context";

let ctx: Ctx;
beforeEach(async () => {
  freshDb();
  ctx = await makeOrg("Morris Blackburn");
});

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

describe("tasks", () => {
  it("creates a task with department, workflow and files", async () => {
    const email = await processUpload("enquiry.eml", "message/rfc822", Buffer.from("From: client@example.com\nSubject: New matter\n\nHello"));
    const { taskId, versionId } = await createTask(
      ctx,
      { name: "Initial client enquiry response", departmentName: "Client Services", workflowName: "New Client Intake", instructions: "Draft the initial response per our intake process.", inputText: "Client enquiry below." },
      [{ ...email, role: "input" }],
    );
    const t = getTask(ctx, taskId);
    expect(t.department?.name).toBe("Client Services");
    expect(t.workflow?.name).toBe("New Client Intake");
    expect(t.versions).toHaveLength(1);
    const v = getTaskVersion(ctx, versionId);
    expect(v.files[0].extractedText).toContain("New matter");
    expect(listTasks(ctx)).toHaveLength(1);
  });

  it("only creates a new version when model-visible content changes", async () => {
    const { taskId, versionId } = await createTask(ctx, { name: "Refund request", instructions: "Process per policy.", inputText: "I want a refund." });
    const same = await updateTask(ctx, taskId, { name: "Refund request (renamed)", instructions: "Process per policy.", inputText: "I want a refund.", keepFileIds: [] });
    expect(same.newVersion).toBe(false);
    expect(same.versionId).toBe(versionId);

    const changed = await updateTask(ctx, taskId, { name: "Refund request", instructions: "Process per policy v2.", inputText: "I want a refund.", keepFileIds: [] });
    expect(changed.newVersion).toBe(true);
    expect(changed.version).toBe(2);
    expect(getTaskVersion(ctx, versionId).version.instructions).toBe("Process per policy.");
  });

  it("carries kept files into the next version and leaves the old version intact", async () => {
    const f1 = await processUpload("a.txt", "text/plain", Buffer.from("alpha"));
    const f2 = await processUpload("b.txt", "text/plain", Buffer.from("beta"));
    const { taskId, versionId } = await createTask(ctx, { name: "T", instructions: "Do it" }, [{ ...f1, role: "input" }, { ...f2, role: "reference" }]);
    const v1 = getTaskVersion(ctx, versionId);
    const keep = v1.files.find((f) => f.filename === "a.txt")!.id;
    const u = await updateTask(ctx, taskId, { name: "T", instructions: "Do it", keepFileIds: [keep] });
    expect(u.newVersion).toBe(true);
    expect(getTaskVersion(ctx, u.versionId).files.map((f) => f.filename)).toEqual(["a.txt"]);
    expect(getTaskVersion(ctx, versionId).files).toHaveLength(2);
  });

  it("builds a deterministic payload: instructions as system, inputs and files as user content", async () => {
    const txt = await processUpload("policy.md", "text/markdown", Buffer.from("# Policy\nRefunds within 30 days."));
    const img = await processUpload("receipt.png", "image/png", PNG);
    const { versionId } = await createTask(ctx, { name: "T", instructions: "Apply the policy.", inputText: "Customer complaint text" }, [{ ...txt, role: "reference" }, { ...img, role: "input" }]);
    const a = await buildPayloadForVersion(getDb(), versionId);
    const b = await buildPayloadForVersion(getDb(), versionId);
    expect(a.hash).toBe(b.hash);
    expect(a.payload.system).toBe("Apply the policy.");
    expect(a.payload.user[0]).toMatchObject({ type: "text" });
    expect((a.payload.user[0] as { text: string }).text).toContain('<document name="policy.md" role="reference">');
    expect(a.payload.user[1]).toMatchObject({ type: "image", mimeType: "image/png" });
  });

  it("sends instructions as the user message when there are no inputs", async () => {
    const { versionId } = await createTask(ctx, { name: "T", instructions: "Write our Q3 operational summary." });
    const { payload } = await buildPayloadForVersion(getDb(), versionId);
    expect(payload.system).toBeNull();
    expect(payload.user).toEqual([{ type: "text", text: "Write our Q3 operational summary." }]);
  });

  it("rejects unsupported or empty files", async () => {
    await expect(processUpload("x.exe", "application/octet-stream", Buffer.from("MZ"))).rejects.toThrow(/unsupported/i);
    await expect(processUpload("x.txt", "text/plain", Buffer.alloc(0))).rejects.toThrow(/empty/);
  });

  it("validates required fields", async () => {
    await expect(createTask(ctx, { name: "", instructions: "x" })).rejects.toThrow();
    await expect(createTask(ctx, { name: "x", instructions: "  " })).rejects.toThrow();
  });
});
