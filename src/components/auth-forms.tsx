"use client";

import Link from "next/link";
import { useActionState } from "react";
import { acceptInviteAction, loginAction, signUpAction, type ActionState } from "@/app/actions";
import { Button, Field, FormMessage } from "./ui";

export function SignUpForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(signUpAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <Field label="Your name">
        <input name="name" required autoComplete="name" className="field" defaultValue={state?.data?.name} placeholder="Alex Morgan" />
      </Field>
      <Field label="Work email">
        <input name="email" type="email" required autoComplete="email" className="field" defaultValue={state?.data?.email} placeholder="alex@company.com" />
      </Field>
      <Field label="Organization" hint="Your team can join later with an invite link.">
        <input name="organization" required className="field" defaultValue={state?.data?.organization} placeholder="Morris Blackburn" />
      </Field>
      <Field label="Password" hint="At least 10 characters.">
        <input name="password" type="password" required minLength={10} autoComplete="new-password" className="field" />
      </Field>
      <FormMessage state={state} />
      <Button className="h-11 w-full" disabled={pending}>
        {pending ? "Creating workspace…" : "Create workspace"}
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-fg underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next ?? ""} />
      {notice && <FormMessage state={{ error: notice }} />}
      <Field label="Email">
        <input name="email" type="email" required autoComplete="email" className="field" defaultValue={state?.data?.email} />
      </Field>
      <Field label="Password">
        <input name="password" type="password" required autoComplete="current-password" className="field" />
      </Field>
      <FormMessage state={state} />
      <Button className="h-11 w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="text-fg underline-offset-4 hover:underline">
          Create a workspace
        </Link>
      </p>
    </form>
  );
}

export function AcceptInviteForm({ token, signedInAs, email }: { token: string; signedInAs?: string; email?: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(acceptInviteAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      {signedInAs ? (
        <p className="text-sm text-muted">
          You&apos;re signed in as <span className="text-fg">{signedInAs}</span>.
        </p>
      ) : (
        <>
          <Field label="Your name">
            <input name="name" required className="field" defaultValue={state?.data?.name} />
          </Field>
          <Field label="Work email">
            <input name="email" type="email" required className="field" defaultValue={state?.data?.email ?? email ?? ""} readOnly={Boolean(email)} />
          </Field>
          <Field label="Password" hint="At least 10 characters.">
            <input name="password" type="password" required minLength={10} autoComplete="new-password" className="field" />
          </Field>
        </>
      )}
      <FormMessage state={state} />
      <Button className="h-11 w-full" disabled={pending}>
        {pending ? "Joining…" : "Join organization"}
      </Button>
    </form>
  );
}
