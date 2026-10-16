"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Alert, Badge, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/settings";
import { ORDER_STATUS, type OrderListItem, type OrderStatus, type Page } from "@/lib/types";

const GROUPS: { title: string; statuses: OrderStatus[]; hint: string }[] = [
  { title: "To collect", statuses: ["NEW", "ALLOCATED", "PICKING"], hint: "Pick these up from the places shown" },
  { title: "On the van", statuses: ["LOADED", "OUT_FOR_DELIVERY"], hint: "Ready to deliver" },
  { title: "Failed — deliver again or bring back", statuses: ["FAILED"], hint: "" },
];

/** A driver's to-do list (drivers only ever get their own orders from the API). */
export default function DeliveriesPage() {
  const { user } = useAuth();
  const isDriver = user?.role === "DRIVER";
  const [open, setOpen] = useState<OrderListItem[] | null>(null);
  const [done, setDone] = useState<OrderListItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    api<Page<OrderListItem>>("/orders", { query: { open: "true", pageSize: 100 } })
      .then((p) => setOpen(isDriver ? p.items : p.items.filter((o) => o.driver)))
      .catch((e) => setError(e.message));
    api<Page<OrderListItem>>("/orders", { query: { deliveredSince: today.toISOString(), pageSize: 100 } })
      .then((p) => setDone(p.items))
      .catch(() => undefined);
  }, [isDriver]);

  return (
    <div>
      <PageHeader
        title={isDriver ? "My deliveries" : "Deliveries"}
        description={isDriver ? "Your orders for today and coming days." : "Open orders that have a driver. Assign drivers on each order."}
      />
      {error && <Alert>{error}</Alert>}
      {!open ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-8">
          {open.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-white/60 p-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-ok/10 text-ok">
                <Icon name="deliveries" className="size-6" />
              </span>
              <p className="font-medium text-ink">Nothing to deliver right now</p>
              <p className="text-sm text-muted">New orders with a driver will show up here.</p>
            </div>
          )}
          {GROUPS.map((g) => {
            const items = open.filter((o) => g.statuses.includes(o.status));
            if (!items.length) return null;
            return (
              <section key={g.title}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  {g.title}
                  <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">{items.length}</span>
                </h2>
                <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((o) => (
                    <DeliveryCard key={o.id} order={o} showDriver={!isDriver} />
                  ))}
                </ul>
              </section>
            );
          })}
          {done.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                Delivered today
                <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs font-semibold text-ok">{done.length}</span>
              </h2>
              <ul className="grid gap-3 opacity-80 md:grid-cols-2 xl:grid-cols-3">
                {done.map((o) => (
                  <DeliveryCard key={o.id} order={o} showDriver={!isDriver} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function DeliveryCard({ order: o, showDriver }: { order: OrderListItem; showDriver: boolean }) {
  return (
    <li>
      <Link
        href={`/deliveries/${o.id}`}
        className="flex h-full flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold tracking-tight text-ink">{o.customerName}</p>
            <p className="mt-0.5 text-xs text-muted">
              <span className="font-mono">{o.orderNumber}</span>
              {o.deliveryDate && ` · ${new Date(o.deliveryDate).toLocaleDateString()}`}
              {o.timeWindow && ` · ${o.timeWindow}`}
            </p>
          </div>
          <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
        </div>

        {o.address && (
          <p className="flex items-start gap-2 text-sm text-ink">
            <Icon name="locations" className="mt-0.5 size-4 text-muted" />
            <span className="min-w-0">{o.address}</span>
          </p>
        )}

        <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3 text-xs font-medium">
          {showDriver && o.driver && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-ink">
              <Icon name="account" className="size-3.5 text-muted" />
              {o.driver.name}
            </span>
          )}
          {o.pickups.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/10 px-2.5 py-1 text-warn">
              <Icon name="stock" className="size-3.5" />
              Collect at {o.pickups.map((p) => `${p.site} (${p.items})`).join(", ")}
            </span>
          )}
          {o.inTransit > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-brand">
              <Icon name="deliveries" className="size-3.5" />
              {o.inTransit} on the van
            </span>
          )}
          {o.paymentStatus === "COD" && o.codAmount && (
            <span className="inline-flex items-center rounded-full bg-danger/10 px-2.5 py-1 font-semibold text-danger">Collect {formatMoney(o.codAmount)}</span>
          )}
        </div>
      </Link>
    </li>
  );
}
