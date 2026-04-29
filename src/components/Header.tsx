"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

const NAV: { href: string; label: string }[] = [
  { href: "/",          label: "Dashboard" },
  { href: "/hive",      label: "Hive" },
  { href: "/memory",    label: "Memory" },
  { href: "/registry",  label: "Registry" },
  { href: "/assistant", label: "Assistant" },
];

export interface HeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Page-specific buttons (Refresh, etc.) rendered before Sign out. */
  rightActions?: ReactNode;
  /** Optional second row beneath the main bar (e.g. filter inputs). */
  belowBar?: ReactNode;
}

export function Header({ title, subtitle, rightActions, belowBar }: HeaderProps) {
  const pathname = usePathname();
  return (
    <header className="border-b border-card-border bg-card px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="text-sm text-muted mt-0.5">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1 mr-4">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname?.startsWith(item.href);
              return active ? (
                <span
                  key={item.href}
                  className="px-3 py-1.5 text-sm rounded bg-accent/20 text-accent font-medium"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1.5 text-sm rounded text-muted hover:text-foreground hover:bg-card-border/30 transition-colors"
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {rightActions}
          <a
            href="/api/auth/signout"
            className="px-3 py-1.5 text-sm border border-card-border rounded hover:bg-card-border/50 transition-colors"
          >
            Sign out
          </a>
        </div>
      </div>
      {belowBar ? <div className="mt-3">{belowBar}</div> : null}
    </header>
  );
}
