import { requireCtx } from "@/server/auth/next";
import { TopNav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, ctx } = await requireCtx();
  const org = session.organizations.find((o) => o.id === ctx.organizationId)!;
  return (
    <>
      <TopNav user={session.user} organization={org} organizations={session.organizations} />
      <main className="mx-auto max-w-[1320px] px-4 pb-24 pt-10 sm:px-6">{children}</main>
    </>
  );
}
