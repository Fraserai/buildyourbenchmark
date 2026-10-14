"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logoutAction, switchOrgAction } from "@/app/actions";
import { Icon, Logo, buttonClass, cx } from "./ui";

const LINKS = [
  { href: "/workspace", label: "Workspace" },
  { href: "/tasks", label: "Tasks" },
  { href: "/runs", label: "Runs" },
  { href: "/models", label: "Models" },
];

export function TopNav({
  user,
  organization,
  organizations,
}: {
  user: { name: string; email: string };
  organization: { id: string; name: string; role: string };
  organizations: { id: string; name: string; role: string }[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-3 px-4 sm:px-6">
        <Link href="/workspace" className="mr-2 shrink-0" aria-label="Workbench home">
          <Logo compact />
        </Link>
        <nav className="no-scrollbar -mx-1 flex h-16 min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto overflow-y-hidden px-1">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cx(
                  "relative flex shrink-0 items-center px-3 text-sm transition-colors",
                  active ? "text-white" : "text-muted hover:text-fg",
                )}
              >
                {l.label}
                {active && <span className="spectrum absolute inset-x-3 bottom-0 h-px" />}
              </Link>
            );
          })}
        </nav>
        <div className="hidden sm:block">
          <Link href="/tasks/new" className={buttonClass("primary", "h-9 px-3.5")}>
            <Icon name="plus" />
            New task
          </Link>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] py-1 pl-1 pr-2.5 text-sm hover:bg-white/[0.06]"
            aria-expanded={open}
            aria-haspopup="menu"
          >
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-output/40 to-time/30 text-[11px] font-semibold text-white">{initials}</span>
            <span className="hidden max-w-[140px] truncate text-muted md:block">{organization.name}</span>
          </button>
          {open && (
            <div role="menu" className="panel rise absolute right-0 mt-2 w-72 overflow-hidden p-1.5 !bg-ink-900/95">
              <div className="px-3 py-2.5">
                <div className="truncate text-sm font-medium text-white">{user.name}</div>
                <div className="truncate text-xs text-faint">{user.email}</div>
              </div>
              <div className="my-1 h-px bg-line" />
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Organization</div>
              {organizations.map((o) => (
                <form key={o.id} action={switchOrgAction}>
                  <input type="hidden" name="organizationId" value={o.id} />
                  <button className={cx("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-white/[0.05]", o.id === organization.id ? "text-white" : "text-muted")}>
                    <span className="truncate">{o.name}</span>
                    {o.id === organization.id ? <Icon name="check" className="text-price" /> : <span className="text-[11px] text-faint">{o.role}</span>}
                  </button>
                </form>
              ))}
              <div className="my-1 h-px bg-line" />
              <Link href="/team" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-white/[0.05] hover:text-fg">
                <Icon name="users" /> Team & departments
              </Link>
              <Link href="/settings" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-white/[0.05] hover:text-fg">
                <Icon name="layers" /> Settings
              </Link>
              <form action={logoutAction}>
                <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-white/[0.05] hover:text-fg">
                  <Icon name="arrow" /> Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
