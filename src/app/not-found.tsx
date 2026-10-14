import { ButtonLink, Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo />
      <h1 className="display mt-10 text-5xl text-white">Not found</h1>
      <p className="mt-3 max-w-sm text-sm text-muted">This page doesn&apos;t exist, or it belongs to an organization you&apos;re not a member of.</p>
      <ButtonLink href="/workspace" variant="secondary" className="mt-8">
        Back to workspace
      </ButtonLink>
    </div>
  );
}
