import { requireCtx } from "@/server/auth/next";
import { listDepartments, listInvites, listMembers } from "@/server/orgs/service";
import { removeMemberAction, renameDepartmentAction, revokeInviteAction, updateMemberAction } from "@/app/actions";
import { DepartmentForm, InviteForm } from "@/components/team-forms";
import { Badge, Button, PageHeader, Panel, SectionTitle } from "@/components/ui";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const { ctx } = await requireCtx();
  const members = listMembers(ctx);
  const departments = listDepartments(ctx);
  const invites = listInvites(ctx);
  const isAdmin = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div>
      <PageHeader eyebrow="Organization" title="Team & departments" description="Anyone in your organization can create tasks and run them. The person who does the work is the best person to describe it." />

      <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="space-y-10">
          <section>
            <SectionTitle>Members · {members.length}</SectionTitle>
            <Panel className="divide-y divide-line overflow-hidden">
              {members.map((m) => (
                <div key={m.membershipId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-white">{m.name}</span>
                      {m.userId === ctx.userId && <Badge>you</Badge>}
                    </div>
                    <div className="truncate text-xs text-faint">
                      {m.email} · joined {formatDate(m.joinedAt)}
                    </div>
                  </div>
                  <form action={updateMemberAction} className="flex items-center gap-2">
                    <input type="hidden" name="membershipId" value={m.membershipId} />
                    <select name="departmentId" defaultValue={m.departmentId ?? ""} className="field h-9 w-auto py-1 text-xs" disabled={!isAdmin && m.userId !== ctx.userId} aria-label="Department">
                      <option value="">No department</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <select name="role" defaultValue={m.role} className="field h-9 w-auto py-1 text-xs" disabled={!isAdmin} aria-label="Role">
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      <option value="owner" disabled={ctx.role !== "owner"}>
                        Owner
                      </option>
                    </select>
                    {(isAdmin || m.userId === ctx.userId) && (
                      <Button variant="ghost" className="h-9 text-xs">
                        Save
                      </Button>
                    )}
                  </form>
                  {isAdmin && m.role !== "owner" && m.userId !== ctx.userId && (
                    <form action={removeMemberAction}>
                      <input type="hidden" name="membershipId" value={m.membershipId} />
                      <Button variant="ghost" className="h-9 text-xs hover:!text-danger">
                        Remove
                      </Button>
                    </form>
                  )}
                </div>
              ))}
            </Panel>
          </section>

          <section>
            <SectionTitle>Departments · {departments.length}</SectionTitle>
            <div className="mb-3">
              <DepartmentForm />
            </div>
            {departments.length === 0 ? (
              <p className="text-sm text-faint">No departments yet. They&apos;re optional; tasks can also create them as you go.</p>
            ) : (
              <Panel className="divide-y divide-line overflow-hidden">
                {departments.map((d) => (
                  <div key={d.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      {isAdmin ? (
                        <form action={renameDepartmentAction} className="flex min-w-0 flex-1 items-center gap-2">
                          <input type="hidden" name="departmentId" value={d.id} />
                          <input name="name" defaultValue={d.name} className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 font-medium text-white hover:border-line focus:border-line focus:outline-none" aria-label="Department name" />
                        </form>
                      ) : (
                        <span className="flex-1 font-medium text-white">{d.name}</span>
                      )}
                      <span className="text-xs text-faint">
                        {d.taskCount} tasks · {d.memberCount} members
                      </span>
                    </div>
                    {d.workflows.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-2">
                        {d.workflows.map((w) => (
                          <Badge key={w.id}>{w.name}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </Panel>
            )}
          </section>
        </div>

        <aside className="space-y-8">
          {isAdmin ? (
            <section>
              <SectionTitle>Invite a colleague</SectionTitle>
              <Panel className="p-5">
                <InviteForm departments={departments.map((d) => ({ id: d.id, name: d.name }))} />
              </Panel>
            </section>
          ) : (
            <Panel className="p-5 text-sm text-muted">Ask an admin to invite colleagues.</Panel>
          )}
          {isAdmin && invites.length > 0 && (
            <section>
              <SectionTitle>Pending invites</SectionTitle>
              <div className="panel-flat divide-y divide-line">
                {invites.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-fg">{i.email ?? "Anyone with the link"}</div>
                      <div className="text-xs text-faint">
                        {i.role} · expires {formatDate(i.expiresAt)}
                      </div>
                    </div>
                    <form action={revokeInviteAction}>
                      <input type="hidden" name="inviteId" value={i.id} />
                      <Button variant="ghost" className="h-8 text-xs">
                        Revoke
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
