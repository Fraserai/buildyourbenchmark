import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/next";
import { LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (session?.ctx) redirect("/workspace");
  return (
    <div className="panel p-7 sm:p-9">
      <h1 className="display text-4xl text-white">Welcome back</h1>
      <p className="mb-8 mt-2 text-sm text-muted">Sign in to your workspace.</p>
      <LoginForm next={sp.next} notice={sp.reason === "no-organization" ? "Your account isn't a member of any organization. Ask an admin for an invite link." : undefined} />
    </div>
  );
}
