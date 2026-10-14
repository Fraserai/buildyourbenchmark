import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/next";
import { getArtifact } from "@/server/runs/service";
import { NotFoundError } from "@/server/auth/context";
import { audit } from "@/server/audit";

const EXT = { markdown: "md", json: "json", code: "txt", text: "txt" } as const;

export async function GET(req: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  const session = await getSession();
  if (!session?.ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { artifactId } = await params;
  try {
    const { artifact, runModel } = getArtifact(session.ctx, artifactId);
    const url = new URL(req.url);
    if (url.searchParams.get("download")) {
      audit(session.ctx, "artifact.downloaded", { type: "artifact", id: artifactId });
      const safe = `${runModel.modelName}${runModel.modelVariant ? `-${runModel.modelVariant}` : ""}`.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
      return new NextResponse(artifact.content ?? "", {
        headers: {
          "content-type": `${artifact.artifactType === "json" ? "application/json" : artifact.artifactType === "markdown" ? "text/markdown" : "text/plain"}; charset=utf-8`,
          "content-disposition": `attachment; filename="${safe}-${runModel.runId.slice(-8)}.${EXT[artifact.artifactType]}"`,
          "cache-control": "private, no-store",
        },
      });
    }
    return NextResponse.json(
      { id: artifact.id, content: artifact.content ?? "", artifactType: artifact.artifactType, sha256: artifact.sha256 },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: "not found" }, { status: 404 });
    throw e;
  }
}
