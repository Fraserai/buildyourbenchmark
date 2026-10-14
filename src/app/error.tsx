"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <h1 className="display text-4xl text-white">Something went wrong</h1>
      <p className="mt-3 max-w-sm text-sm text-muted">The error has been logged. Your tasks and runs are safe.</p>
      <Button variant="secondary" className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
