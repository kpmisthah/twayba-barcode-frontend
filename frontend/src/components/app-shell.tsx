"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, iconForHref } from "@/components/icons";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { ROLE_LABELS } from "@/lib/types";

/** Phone tab bar: the first of these the user is allowed to open, plus the menu. */
const TAB_HREFS = ["/", "/scan", "/pos", "/deliveries", "/orders"];

/** Requires login; renders the sidebar (desktop) or top bar + tab bar + slide-in menu (phone). */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (loading || !user) return <Spinner />;

  const items = navFor(user.role);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const tabs = items.filter((i) => TAB_HREFS.includes(i.href)).slice(0, 4);
  const current = items.find((i) => isActive(i.href));

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {items.map((item, i) => {
        const active = isActive(item.href);
        return (
          <div key={item.href}>
            {item.section && item.section !== items[i - 1]?.section && (
              <p className="mt-5 mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted/80">{item.section}</p>
            )}
            <Link
              href={item.href}
              onClick={() => setMenuOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`group relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                active ? "bg-brand/10 text-brand" : "text-ink/75 hover:bg-surface hover:text-ink"
              }`}
            >
              {active && <span className="absolute top-2 bottom-2 -left-1 w-1 rounded-full bg-brand" />}
              <Icon name={iconForHref(item.href)} className={`size-4.5 ${active ? "" : "text-muted group-hover:text-ink"}`} />
              {item.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );

  const userBox = (
    <div className="border-t border-line pt-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand to-violet-500 text-sm font-semibold text-white shadow-sm">
          {user.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
          <p className="text-xs text-muted">{ROLE_LABELS[user.role]}</p>
        </div>
        <button
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          aria-label="Sign out"
          title="Sign out"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Icon name="logout" className="size-4.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-line bg-white p-4 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="-mr-2 min-h-0 overflow-y-auto pr-2">
          <Brand />
          <div className="mt-6">{nav}</div>
        </div>
        {userBox}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/85 px-4 py-2 backdrop-blur-md lg:hidden">
        <Brand />
        <p className="text-sm font-semibold text-ink">{current?.label}</p>
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="flex size-11 items-center justify-center rounded-xl text-ink transition-colors hover:bg-surface"
        >
          <Icon name="menu" />
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 animate-fade-in bg-ink/40 backdrop-blur-sm lg:hidden" onClick={() => setMenuOpen(false)}>
          <aside
            className="flex h-full w-72 max-w-[85vw] animate-sheet-up flex-col justify-between bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-h-0 overflow-y-auto">
              <div className="flex items-center justify-between">
                <Brand />
                <button
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="flex size-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface"
                >
                  <Icon name="close" />
                </button>
              </div>
              <div className="mt-6">{nav}</div>
            </div>
            {userBox}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 pb-28 sm:px-6 lg:px-10 lg:py-8 lg:pb-10">
        {/* Every page sits in a centred column; narrower pages centre themselves inside it (mx-auto + max-w). */}
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* Phone tab bar */}
      <nav
        aria-label="Quick links"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        {tabs.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active ? "text-brand" : "text-muted"
              }`}
            >
              <Icon name={iconForHref(item.href)} className="size-5.5" />
              {item.href === "/pos" ? "Sell" : item.label}
            </Link>
          );
        })}
        <button onClick={() => setMenuOpen(true)} className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted">
          <Icon name="menu" className="size-5.5" />
          Menu
        </button>
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-brand to-violet-500 text-sm font-bold text-white shadow-md shadow-brand/30">
        T
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-ink">Twayba</span>
    </Link>
  );
}
