"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { ROLE_LABELS } from "@/lib/types";

/** Requires login; renders the sidebar (desktop) or slide-in menu (phone). */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return <Spinner />;

  const items = navFor(user.role);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setMenuOpen(false)}
          className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-medium ${
            isActive(item.href) ? "bg-brand/10 text-brand" : "text-ink hover:bg-surface"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );

  const userBox = (
    <div className="border-t border-line pt-4">
      <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
      <p className="text-xs text-muted">{ROLE_LABELS[user.role]}</p>
      <button
        onClick={() => {
          logout();
          router.replace("/login");
        }}
        className="mt-3 min-h-11 w-full rounded-lg border border-line text-sm font-medium text-ink hover:bg-surface"
      >
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-line bg-white p-4 lg:flex lg:sticky lg:top-0 lg:h-screen">
        <div>
          <Brand />
          <div className="mt-6">{nav}</div>
        </div>
        {userBox}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white px-4 py-2 lg:hidden">
        <Brand />
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="flex size-11 items-center justify-center rounded-lg text-xl text-ink hover:bg-surface"
        >
          ☰
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)}>
          <aside
            className="flex h-full w-72 max-w-[85vw] flex-col justify-between bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center justify-between">
                <Brand />
                <button
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="flex size-11 items-center justify-center rounded-lg text-muted hover:bg-surface"
                >
                  ✕
                </button>
              </div>
              <div className="mt-6">{nav}</div>
            </div>
            {userBox}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">T</span>
      <span className="font-semibold text-ink">Twayba</span>
    </Link>
  );
}
