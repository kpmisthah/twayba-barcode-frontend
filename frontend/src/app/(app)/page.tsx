"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon, iconForHref, type IconName } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { navFor, type NavItem } from "@/lib/nav";
import { can } from "@/lib/permissions";
import { formatMoney, useSettings } from "@/lib/settings";
import { MOVEMENT_LABELS, ROLE_DESCRIPTIONS, ROLE_LABELS, type Dashboard } from "@/lib/types";

type Tone = "brand" | "ok" | "warn" | "danger" | "violet" | "slate";

/** Icon chip colours per tone. */
const CHIP: Record<Tone, string> = {
  brand: "bg-brand/10 text-brand",
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
  violet: "bg-violet-500/10 text-violet-600",
  slate: "bg-surface text-muted",
};

/** Greeting that depends on the visitor's clock, so it's set after the page loads. */
function useGreeting() {
  // Strings are primitives, so the snapshots are stable; the server renders the neutral fallback.
  const greeting = useSyncExternalStore(
    () => () => {},
    () => {
      const h = new Date().getHours();
      return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    },
    () => "Hello",
  );
  const today = useSyncExternalStore(
    () => () => {},
    () => new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }),
    () => "",
  );
  return { greeting, today };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { greeting, today } = useGreeting();
  if (!user) return null;

  const shortcuts = navFor(user.role).filter((item) => !["/", "/account", "/scan"].includes(item.href));
  const groups = new Map<string, NavItem[]>();
  for (const item of shortcuts) groups.set(item.section ?? "Sell", [...(groups.get(item.section ?? "Sell") ?? []), item]);

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        description={`${today ? `${today} · ` : ""}${ROLE_LABELS[user.role]} — ${ROLE_DESCRIPTIONS[user.role]}`}
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        {can(user.role, "stockRead") && (
          <ActionCard href="/scan" icon="scan" title="Scan a barcode" hint="Look up, add or move stock" primary />
        )}
        {user.role === "DRIVER" && <ActionCard href="/deliveries" icon="deliveries" title="My deliveries" hint="Today's drops" primary />}
        {can(user.role, "pos") && <ActionCard href="/pos" icon="pos" title="Sell (POS)" hint="Ring up a sale" />}
      </div>

      {can(user.role, "dashboard") && <Figures />}

      {[...groups].map(([section, list]) => (
        <section key={section} className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{section === "Sell" ? "Selling" : section}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {list.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-3 rounded-xl border border-line bg-white p-3.5 text-sm font-medium text-ink shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted transition-colors group-hover:bg-brand/10 group-hover:text-brand">
                  <Icon name={iconForHref(item.href)} className="size-4.5" />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function ActionCard({ href, icon, title, hint, primary }: { href: string; icon: IconName; title: string; hint: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`group relative flex items-center gap-4 overflow-hidden rounded-2xl p-5 transition-all hover:-translate-y-0.5 ${
        primary
          ? "bg-linear-to-br from-brand to-violet-600 text-white shadow-lg shadow-brand/25 hover:shadow-xl hover:shadow-brand/30"
          : "border border-line bg-white text-ink shadow-sm hover:border-brand/40 hover:shadow-md"
      }`}
    >
      {primary && <span className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-white/10" />}
      <span className={`relative flex size-12 shrink-0 items-center justify-center rounded-xl ${primary ? "bg-white/20" : "bg-brand/10 text-brand"}`}>
        <Icon name={icon} className="size-6" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-lg font-semibold tracking-tight">{title}</span>
        <span className={`block text-sm ${primary ? "text-white/80" : "text-muted"}`}>{hint}</span>
      </span>
      <Icon name="arrow" className="relative size-5 opacity-60 transition-transform group-hover:translate-x-1 group-hover:opacity-100" />
    </Link>
  );
}

function Figures() {
  const settings = useSettings();
  const [d, setD] = useState<Dashboard | null>(null);

  useEffect(() => {
    api<Dashboard>("/dashboard").then(setD).catch(() => setD(null));
  }, []);

  if (!d)
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
    );
  const money = (v: string) => formatMoney(v, settings?.currency);

  return (
    <>
      {d.websiteIssues > 0 && (
        <Link
          href="/orders/website-problems"
          className="mb-4 flex items-center gap-3 rounded-xl border border-danger/25 bg-danger/5 p-4 text-sm transition-colors hover:bg-danger/10"
        >
          <Icon name="alert" className="size-5 text-danger" />
          <span className="flex-1 font-medium text-danger">
            {d.websiteIssues} website order{d.websiteIssues === 1 ? "" : "s"} could not be imported
          </span>
          <span className="font-medium text-brand">Fix →</span>
        </Link>
      )}

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Today at a glance</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {d.sales && (
          <Tile
            href="/sales"
            icon="sales"
            tone="brand"
            label="Today's sales"
            value={money(d.sales.total)}
            note={`${d.sales.count} sale${d.sales.count === 1 ? "" : "s"}${d.returns?.count ? ` · ${d.returns.count} return(s) −${money(d.returns.total)}` : ""}`}
          />
        )}
        <Tile
          href="/low-stock"
          icon="low-stock"
          tone={d.lowStock > 0 ? "danger" : "ok"}
          label="Low stock"
          value={String(d.lowStock)}
          note={d.lowStockTop.map((r) => r.name).join(", ") || "Everything above minimum"}
          alert={d.lowStock > 0}
        />
        <Tile href="/products" icon="products" tone="violet" label="Products" value={String(d.products)} note={`${d.stockUnits.toLocaleString()} units in store`} />
        <Tile href="/orders" icon="orders" tone="warn" label="Orders today" value={String(d.orders.today)} note={`${d.orders.pending} waiting to be picked`} />
        <Tile href="/orders?status=LOADED" icon="stock" tone="slate" label="Ready for delivery" value={String(d.orders.readyForDelivery)} />
        <Tile href="/deliveries" icon="deliveries" tone="brand" label="Out for delivery" value={String(d.orders.outForDelivery)} />
        <Tile
          href="/orders?status=FAILED"
          icon="alert"
          tone={d.orders.failed > 0 ? "danger" : "slate"}
          label="Failed deliveries"
          value={String(d.orders.failed)}
          alert={d.orders.failed > 0}
          note={d.orders.failed ? "Deliver again or bring back" : undefined}
        />
      </div>

      {d.recentMovements.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Recent stock movements</h2>
            <Link href="/stock-history" className="text-sm font-medium text-brand hover:underline">
              View all →
            </Link>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white shadow-sm">
            {d.recentMovements.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface/60">
                <span className="flex min-w-0 items-center gap-3">
                  <Badge>{MOVEMENT_LABELS[m.type]}</Badge>
                  <span className="min-w-0 truncate">
                    <span className="font-semibold tabular-nums text-ink">{m.quantity} ×</span>{" "}
                    <Link href={`/products/${m.variant.product.id}`} className="text-brand hover:underline">
                      {m.variant.name === "Default" ? m.variant.product.name : `${m.variant.product.name} – ${m.variant.name}`}
                    </Link>
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {m.user?.name ?? "System"} · {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Tile({
  href,
  icon,
  tone,
  label,
  value,
  note,
  alert,
}: {
  href: string;
  icon: IconName;
  tone: Tone;
  label: string;
  value: string;
  note?: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl border border-line bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className={`flex size-8 items-center justify-center rounded-lg ${CHIP[tone]}`}>
          <Icon name={icon} className="size-4" />
        </span>
      </div>
      <p className={`mt-3 text-3xl font-semibold tracking-tight tabular-nums ${alert ? "text-danger" : "text-ink"}`}>{value}</p>
      <p className="mt-1 min-h-4 truncate text-xs text-muted">{note}</p>
    </Link>
  );
}
