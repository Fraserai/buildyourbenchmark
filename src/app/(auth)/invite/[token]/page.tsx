import { findInvite } from "@/server/auth/service";
import { getSession } from "@/server/auth/next";
import { AcceptInviteForm } from "@/components/auth-forms";
import { ButtonLink } from "@/components/ui";

export const metadata = { title: "Join organization" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = findInvite(token);
  const session = await getSession();
  if (!found) {
    return (
      <div className="panel p-7 sm:p-9">
        <h1 className="display text-4xl text-white">Invite not valid</h1>
        <p className="mb-8 mt-2 text-sm text-muted">This link has expired or was already used. Ask your admin for a new one.</p>
        <ButtonLink href="/login" variant="secondary">
          Go to sign in
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="panel p-7 sm:p-9">
      <div className="eyebrow mb-3">Invitation · {found.invite.role}</div>
      <h1 className="display text-4xl text-white">Join {found.organizationName}</h1>
      <p className="mb-8 mt-2 text-sm text-muted">Create tasks from your own work, run them against AI models and see the actual numbers.</p>
      <AcceptInviteForm token={token} signedInAs={session?.user.email} email={found.invite.email} />
    </div>
  );
}
