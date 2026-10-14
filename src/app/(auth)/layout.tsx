import Link from "next/link";
import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-20 w-full max-w-[1200px] items-center px-4 sm:px-6">
        <Link href="/">
          <Logo />
        </Link>
      </header>
      <div className="flex flex-1 items-start justify-center px-4 pb-20 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-[440px]">{children}</div>
      </div>
    </div>
  );
}
