"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { ReturnScanner } from "@/components/return-scanner";
import { Thumb } from "@/components/thumb";
import { Alert, Badge, Button, Modal, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { allocationName, directionsUrl, onVan } from "@/lib/orders";
import { formatMoney } from "@/lib/settings";
import { EXCEPTION_LABELS, ORDER_STATUS, type Order, type OrderStatus } from "@/lib/types";
import { DeliveredForm, FailForm, ProblemForm } from "./forms";

type Dialog = "delivered" | "failed" | "problem" | null;

const ENDED: OrderStatus[] = ["FAILED", "RETURNED", "CANCELLED"];

export default function DeliveryPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Order>(`/orders/${id}`).then(setOrder), [id]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function start() {
    setBusy(true);
    setError("");
    try {
      setOrder(await api<Order>(`/orders/${id}/start`, { method: "POST", body: {} }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start");
    } finally {
      setBusy(false);
    }
  }

  if (!order) return error ? <Alert>{error}</Alert> : <Spinner />;

  const van = onVan(order);
  const toCollect = order.allocations.filter((a) => a.picked + a.released < a.quantity);
  const directions = directionsUrl(order);
  const done = (next: Order) => {
    setOrder(next);
    setDialog(null);
  };

  return (
    <div className="mx-auto max-w-2xl pb-10">
      <Link href="/deliveries" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
        <Icon name="back" className="size-4" />
        Deliveries
      </Link>

      {/* Header card */}
      <section className="mb-4 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="relative overflow-hidden bg-linear-to-br from-brand to-violet-600 p-5 text-white">
          <span className="pointer-events-none absolute -top-12 -right-12 size-44 rounded-full bg-white/10" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{order.customerName}</h1>
              <p className="mt-1 text-sm text-white/80">
                <span className="font-mono">{order.orderNumber}</span>
                {order.deliveryDate && ` · ${new Date(order.deliveryDate).toLocaleDateString()}`}
                {order.timeWindow && ` · ${order.timeWindow}`}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">{ORDER_STATUS[order.status].label}</span>
          </div>
        </div>

        {ENDED.includes(order.status) && <EndedBanner order={order} />}
      </section>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Contact */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        {order.customerPhone ? (
          <a
            href={`tel:${order.customerPhone}`}
            className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-ok text-base font-semibold text-white shadow-sm shadow-ok/30 transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <Icon name="phone" />
            Call
          </a>
        ) : (
          <span className="flex min-h-14 items-center justify-center rounded-xl bg-surface text-sm text-muted">No phone</span>
        )}
        {directions ? (
          <a
            href={directions}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-brand text-base font-semibold text-white shadow-sm shadow-brand/30 transition-all hover:bg-brand-dark active:scale-[0.98]"
          >
            <Icon name="navigation" />
            Directions
          </a>
        ) : (
          <span className="flex min-h-14 items-center justify-center rounded-xl bg-surface text-sm text-muted">No address</span>
        )}
      </div>

      {/* Where / how to pay */}
      <section className="mb-4 flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm">
        {order.address && <InfoRow icon="locations" label="Deliver to" value={order.address} />}
        {order.customerPhone && <InfoRow icon="phone" label="Phone" value={order.customerPhone} />}
        {order.notes && (
          <div className="flex gap-3 rounded-xl border border-warn/25 bg-warn/5 p-3 text-sm">
            <Icon name="note" className="mt-0.5 size-4.5 text-warn" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-warn">Note for the driver</p>
              <p className="mt-0.5 text-ink">{order.notes}</p>
            </div>
          </div>
        )}
        <Payment order={order} />
      </section>

      {/* Pick-ups */}
      {toCollect.length > 0 && (
        <ItemsCard icon="stock" title="Collect" count={toCollect.reduce((s, a) => s + a.quantity - a.picked - a.released, 0)}>
          {toCollect.map((a) => (
            <li key={a.id} className="flex items-center gap-3 p-3.5 text-sm">
              <Thumb src={a.variant.product.images[0]} size="size-11" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{allocationName(a)}</p>
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
                  <Icon name="locations" className="size-3.5" />
                  {a.path}
                </p>
              </div>
              <span className="rounded-lg bg-surface px-2.5 py-1 font-semibold tabular-nums text-ink">{a.quantity - a.picked - a.released}</span>
            </li>
          ))}
          {can(user?.role, "stockWrite") && (
            <li className="p-3">
              <Link
                href={`/orders/${order.id}/pick`}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-white shadow-sm shadow-brand/30 transition-all hover:bg-brand-dark active:scale-[0.98]"
              >
                <Icon name="scan" />
                Start picking (scan each item)
              </Link>
            </li>
          )}
        </ItemsCard>
      )}

      {/* On the van */}
      {van.length > 0 && (
        <ItemsCard icon="deliveries" title="On the van" count={van.reduce((s, v) => s + v.quantity, 0)}>
          {van.map((v) => (
            <li key={v.variantId} className="flex items-center gap-3 p-3.5 text-sm">
              <Thumb src={v.image} size="size-11" />
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{v.name}</span>
              <span className="rounded-lg bg-surface px-2.5 py-1 font-semibold tabular-nums text-ink">{v.quantity}</span>
            </li>
          ))}
        </ItemsCard>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3">
        {(order.status === "LOADED" || order.status === "FAILED") && van.length > 0 && (
          <Button onClick={start} disabled={busy} className="min-h-14 text-base">
            <Icon name="deliveries" />
            {order.status === "FAILED" ? "Try again — out for delivery" : "Start delivery"}
          </Button>
        )}
        {(order.status === "LOADED" || order.status === "OUT_FOR_DELIVERY") && (
          <>
            <Button onClick={() => setDialog("delivered")} className="min-h-14 bg-ok text-base shadow-ok/30 hover:bg-ok/90 hover:shadow-ok/30">
              <Icon name="check" />
              Delivered
            </Button>
            <Button variant="secondary" onClick={() => setDialog("failed")} className="min-h-12">
              Couldn&rsquo;t deliver
            </Button>
          </>
        )}
        {!["DELIVERED", "RETURNED", "CANCELLED"].includes(order.status) && (
          <Button variant="ghost" onClick={() => setDialog("problem")} className="text-danger hover:bg-danger/5">
            <Icon name="alert" className="size-4.5" />
            Report a problem (missing / damaged box…)
          </Button>
        )}
      </div>

      {order.status === "DELIVERED" && (
        <div className="mt-4">
          <Alert kind="success">
            Delivered {order.deliveredAt && new Date(order.deliveredAt).toLocaleString()}
            {order.recipientName && ` to ${order.recipientName}`}
            {order.codCollected !== null && ` · cash ${formatMoney(order.codCollected)}`}
          </Alert>
        </div>
      )}
      {order.exceptions.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {order.exceptions.map((x) => (
            <li key={x.id} className="flex gap-3 rounded-xl border border-danger/25 bg-danger/5 p-3.5">
              <Icon name="alert" className="mt-0.5 size-4.5 text-danger" />
              <div>
                <p className="font-semibold text-danger">{EXCEPTION_LABELS[x.type]}</p>
                <p className="mt-0.5 text-ink">{x.note}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {order.awaitingReturn && can(user?.role, "stockWrite") && <ReturnScanner order={order} onChange={setOrder} />}

      <Modal title="Delivered" open={dialog === "delivered"} onClose={() => setDialog(null)}>
        {dialog === "delivered" && <DeliveredForm order={order} isApprover={can(user?.role, "orderWrite")} onDone={done} />}
      </Modal>
      <Modal title="Couldn't deliver" open={dialog === "failed"} onClose={() => setDialog(null)}>
        {dialog === "failed" && <FailForm order={order} onDone={done} />}
      </Modal>
      <Modal title="Report a problem" open={dialog === "problem"} onClose={() => setDialog(null)}>
        {dialog === "problem" && <ProblemForm order={order} onDone={done} />}
      </Modal>
    </div>
  );
}

/** Failed / returned / cancelled orders: say why, right under the header. */
function EndedBanner({ order }: { order: Order }) {
  const text =
    order.status === "FAILED"
      ? `Delivery failed${order.failedReason ? ` — ${EXCEPTION_LABELS[order.failedReason]}` : ""}. Deliver again or bring the items back.`
      : order.status === "RETURNED"
        ? "Items were brought back into stock."
        : `Cancelled${order.cancelReason ? ` — ${order.cancelReason}` : ""}.`;
  return (
    <div className="flex items-start gap-3 bg-danger/5 px-5 py-4 text-sm">
      <Icon name="alert" className="mt-0.5 size-5 text-danger" />
      <p className="font-medium text-danger">{text}</p>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted">
        <Icon name={icon} className="size-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
        <p className="mt-0.5 text-base text-ink">{value}</p>
      </div>
    </div>
  );
}

function Payment({ order }: { order: Order }) {
  if (order.paymentStatus === "COD") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-danger/8 p-4 ring-1 ring-danger/20">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
          <Icon name="cash" className="size-6" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-danger">Cash on delivery</p>
          <p className="text-2xl font-semibold tracking-tight text-danger tabular-nums">Collect {formatMoney(order.codAmount)}</p>
        </div>
      </div>
    );
  }
  const paid = order.paymentStatus === "PAID";
  return (
    <div className={`flex items-center gap-3 rounded-xl p-4 ring-1 ${paid ? "bg-ok/8 ring-ok/20" : "bg-warn/8 ring-warn/20"}`}>
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${paid ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
        <Icon name={paid ? "check" : "alert"} className="size-6" />
      </span>
      <p className={`font-semibold ${paid ? "text-ok" : "text-warn"}`}>{paid ? "Already paid" : "Not paid — check with the office"}</p>
    </div>
  );
}

function ItemsCard({ icon, title, count, children }: { icon: IconName; title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <h2 className="flex items-center gap-2.5 border-b border-line px-4 py-3.5 font-semibold tracking-tight text-ink">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon name={icon} className="size-4.5" />
        </span>
        {title}
        <Badge tone="brand">{count}</Badge>
      </h2>
      <ul className="divide-y divide-line">{children}</ul>
    </section>
  );
}
