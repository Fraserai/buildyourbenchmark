import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/next";
import { getRun } from "@/server/runs/service";
import { NotFoundError } from "@/server/auth/context";

export async function GET(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  const session = await getSession();
  if (!session?.ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { runId } = await params;
    return NextResponse.json(getRun(session.ctx, runId), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: "not found" }, { status: 404 });
    throw e;
  }
}
