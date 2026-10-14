"use client";

import { useActionState } from "react";
import { updateRunNotesAction, type ActionState } from "@/app/actions";
import { Button, FormMessage } from "./ui";

export function RunNotes({ runId, label, notes }: { runId: string; label: string | null; notes: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateRunNotesAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="runId" value={runId} />
      <input name="label" defaultValue={label ?? ""} placeholder="Label, e.g. Baseline before policy change" className="field text-sm" maxLength={120} />
      <textarea name="notes" defaultValue={notes ?? ""} rows={3} placeholder="Your team's notes on these outputs" className="field resize-y text-sm" />
      <div className="flex items-center gap-3">
        <Button variant="secondary" className="h-9" disabled={pending}>
          {pending ? "Saving…" : "Save notes"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
