"use client";

import { useActionState, useEffect, useState } from "react";
import { createDepartmentAction, createInviteAction, refreshCatalogueAction, renameOrgAction, updateProfileAction, type ActionState } from "@/app/actions";
import { Button, Field, FormMessage, Icon } from "./ui";
import { CopyButton } from "./output-view";

export function InviteForm({ departments }: { departments: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createInviteAction, undefined);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const link = state?.data?.token ? `${origin}/invite/${state.data.token}` : null;
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <Field label="Email (optional)" hint="Restricts the link to this address.">
          <input name="email" type="email" className="field" placeholder="colleague@company.com" />
        </Field>
        <Field label="Role">
          <select name="role" className="field">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
      </div>
      <Field label="Department (optional)">
        <select name="departmentId" className="field">
          <option value="">None</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Button className="h-10" disabled={pending}>
        {pending ? "Creating…" : "Create invite link"}
      </Button>
      {state?.error && <FormMessage state={state} />}
      {link && (
        <div className="rounded-xl border border-ok/25 bg-ok/[0.06] p-3">
          <div className="mb-2 text-xs text-ok">Single-use link, valid for 7 days. Share it directly; it is shown only once.</div>
          <div className="flex items-center gap-2">
            <code className="num min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2.5 py-1.5 text-xs text-fg">{link}</code>
            <CopyButton text={link} />
          </div>
        </div>
      )}
    </form>
  );
}

export function DepartmentForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createDepartmentAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input name="name" className="field min-w-0 flex-1" placeholder="e.g. Customer Service" required />
      <Button variant="secondary" className="h-[42px]" disabled={pending}>
        <Icon name="plus" /> Add
      </Button>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function SimpleNameForm({ kind, value, label }: { kind: "org" | "profile"; value: string; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(kind === "org" ? renameOrgAction : updateProfileAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <Field label={label}>
        <input name="name" defaultValue={value} className="field" required />
      </Field>
      <div className="flex items-center gap-3">
        <Button variant="secondary" className="h-9" disabled={pending}>
          Save
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function RefreshCatalogueButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(refreshCatalogueAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <Button variant="secondary" className="h-9" disabled={pending}>
        <Icon name="refresh" className={pending ? "animate-spin" : ""} /> {pending ? "Refreshing…" : "Refresh now"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
