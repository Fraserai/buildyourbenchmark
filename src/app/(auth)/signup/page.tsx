import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/next";
import { SignUpForm } from "@/components/auth-forms";

export const metadata = { title: "Create your workspace" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/workspace");
  return (
    <div className="panel p-7 sm:p-9">
      <h1 className="display text-4xl text-white">Create your workspace</h1>
      <p className="mb-8 mt-2 text-sm text-muted">Your tasks, runs and outputs stay private to your organization.</p>
      <SignUpForm />
    </div>
  );
}
