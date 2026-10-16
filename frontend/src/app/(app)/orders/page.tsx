"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, Badge, Input, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ORDER_STATUS, type OrderListItem, type OrderStatus, type Page } from "@/lib/types";

const FILTERS: (OrderStatus | "")[] = ["", "NEW", "ALLOCATED", "PICKING", "LOADED", "OUT_FOR_DELIVERY", "FAILED", "DELIVERED", "CANCELLED"];

export default function OrdersPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Orders />
    </Suspense>
  );
}

function Orders() {
  const { user } = useAuth();
  // ?status=FAILED from the dashboard tiles.
  const initial = useSearchParams().get("status") as OrderStatus | null;
  const [status, setStatus] = useState<OrderStatus | "">(initial && initial in ORDER_STATUS ? initial : "");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Page<OrderListItem> | null>(null);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState(0);
  const canWrite = can(user?.role, "orderWrite");

  useEffect(() => {
    if (canWrite) api<unknown[]>("/website-orders/issues", { query: { status: "OPEN" } }).then((l) => setProblems(l.length)).catch(() => undefined);
  }, [canWrite]);

  useEffect(() => {
    const timer = setTimeout(() => {
      api<Page<OrderListItem>>("/orders", { query: { status: status || undefined, q, pageSize: 50 } })
        .then(setData)
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [status, q]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Orders"
        description="Delivery orders — entered here or sent from the website."
        action={
          can(user?.role, "orderWrite") && (
            <Link href="/orders/new" className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">
              + New order
            </Link>
          )
        }
      />
      {problems > 0 && (
        <Link href="/orders/website-problems" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm hover:bg-danger/10">
          <span className="font-medium text-danger">
            ⚠ {problems} website order{problems === 1 ? "" : "s"} could not be imported
          </span>
          <span className="text-brand">Fix →</span>
        </Link>
      )}
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((s) => (
          <button
            key={s || "all"}
            type="button"
            onClick={() => setStatus(s)}
            className={`min-h-10 rounded-full border px-4 text-sm ${status === s ? "border-brand bg-brand/10 font-semibold text-brand" : "border-line bg-white text-ink"}`}
          >
            {s ? ORDER_STATUS[s].label : "All"}
          </button>
        ))}
      </div>
      <Input className="mb-4" placeholder="Order number, website id, customer name or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
      {error && <Alert>{error}</Alert>}
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-6 text-sm text-muted">No orders.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {data.items.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-surface">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-mono font-semibold text-ink">{o.orderNumber}</span>
                    {o.source === "WEBSITE" && <span className="ml-2 text-xs text-muted">website #{o.externalId}</span>}
                  </p>
                  <p className="truncate text-sm text-ink">{o.customerName}</p>
                  <p className="truncate text-xs text-muted">
                    {[o.address, o.deliveryDate && new Date(o.deliveryDate).toLocaleDateString(), o.timeWindow, `${o._count.lines} line(s)`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
