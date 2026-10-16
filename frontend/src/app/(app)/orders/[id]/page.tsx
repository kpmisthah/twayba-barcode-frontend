"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ReturnScanner } from "@/components/return-scanner";
import { Thumb } from "@/components/thumb";
import { Alert, Badge, Button, Field, Input, Modal, Select, Spinner } from "@/components/ui";
import { api, assetUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { mapsUrl } from "@/lib/maps";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/settings";
import { EXCEPTION_LABELS, ORDER_STATUS, PAYMENT_STATUS_LABELS, type Order } from "@/lib/types";
import { AllocationEditor } from "./allocation-editor";

const FINISHED = ["DELIVERED", "RETURNED", "CANCELLED"];

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canWrite = can(user?.role, "orderWrite");
  const canPick = can(user?.role, "stockWrite");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"allocate" | "cancel" | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(() => api<Order>(`/orders/${id}`).then(setOrder), [id]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    if (canWrite) api<{ id: string; name: string }[]>("/orders/drivers").then(setDrivers).catch(() => undefined);
  }, [canWrite]);

  async function assignDriver(driverId: string) {
    setError("");
    try {
      setOrder(await api<Order>(`/orders/${id}/driver`, { method: "PATCH", body: { driverId: driverId || null } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign the driver");
    }
  }

  async function action(path: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      setOrder(await api<Order>(`/orders/${id}/${path}`, { method: "POST", body: body ?? {} }));
      setDialog(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!order) return error ? <Alert>{error}</Alert> : <Spinner />;

  const totalUnits = order.needs.reduce((s, n) => s + n.quantity, 0);
  const pickedUnits = order.needs.reduce((s, n) => s + n.picked, 0);
  const bySite = new Map<string, Order["allocations"]>();
  for (const a of order.allocations) bySite.set(a.site, [...(bySite.get(a.site) ?? []), a]);

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <Link href="/orders" className="mb-4 inline-block text-sm text-brand">
        ← Orders
      </Link>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold text-ink">{order.orderNumber}</h1>
          <p className="text-sm text-muted">
            {order.source === "WEBSITE" ? `From the website (#${order.externalId})` : `Entered by ${order.createdBy?.name ?? "—"}`} · {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <Badge tone={ORDER_STATUS[order.status].tone}>{ORDER_STATUS[order.status].label}</Badge>
      </div>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Customer & delivery */}
      <section className="mb-4 grid gap-3 rounded-xl border border-line bg-white p-5 text-sm sm:grid-cols-2">
        <div>
          <p className="font-semibold text-ink">{order.customerName}</p>
          {order.customerPhone && (
            <a href={`tel:${order.customerPhone}`} className="text-brand">
              📞 {order.customerPhone}
            </a>
          )}
          {order.address && <p className="mt-1 text-ink">{order.address}</p>}
          {order.latitude !== null && order.longitude !== null && (
            <a href={mapsUrl(order.latitude, order.longitude)} target="_blank" rel="noreferrer" className="text-brand">
              📍 Open map
            </a>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <p>
            <span className="text-muted">Payment:</span> {PAYMENT_STATUS_LABELS[order.paymentStatus]}
            {order.paymentStatus === "COD" && order.codAmount && ` — collect ${formatMoney(order.codAmount)}`}
          </p>
          {(order.deliveryDate || order.timeWindow) && (
            <p>
              <span className="text-muted">Delivery:</span> {[order.deliveryDate && new Date(order.deliveryDate).toLocaleDateString(), order.timeWindow].filter(Boolean).join(", ")}
            </p>
          )}
          {order.notes && (
            <p>
              <span className="text-muted">Notes:</span> {order.notes}
            </p>
          )}
          {order.shortReason && (
            <p className="text-danger">
              Sent with items missing: {order.shortReason} (approved by {order.shortApprovedBy?.name})
            </p>
          )}
          {order.cancelReason && <p className="text-danger">Cancelled: {order.cancelReason}</p>}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-muted">Driver:</span>
            {canWrite && !FINISHED.includes(order.status) ? (
              <Select value={order.driverId ?? ""} onChange={(e) => assignDriver(e.target.value)} className="h-10 min-h-10! w-auto!" aria-label="Driver">
                <option value="">Not assigned</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-ink">{order.driver?.name ?? "Not assigned"}</span>
            )}
          </div>
        </div>
      </section>

      {/* Delivery record */}
      {(order.deliveredAt || order.exceptions.length > 0 || order.failedReason) && (
        <section className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-white p-5 text-sm">
          <h2 className="font-semibold text-ink">Delivery</h2>
          {order.deliveredAt && (
            <div className="flex flex-col gap-1">
              <p className="text-ok">
                ✓ Delivered {new Date(order.deliveredAt).toLocaleString()} by {order.deliveredBy?.name}
                {order.recipientName && ` — received by ${order.recipientName}`}
              </p>
              {order.paymentStatus === "COD" && (
                <p className={order.codCollected !== null && Number(order.codCollected) !== Number(order.codAmount) ? "font-semibold text-danger" : "text-ink"}>
                  Cash collected: {order.codCollected !== null ? formatMoney(order.codCollected) : "—"} (expected {formatMoney(order.codAmount)})
                </p>
              )}
              {order.partialApprovedBy && <p className="text-danger">Partly delivered — approved by {order.partialApprovedBy.name}</p>}
              {order.deliveryNote && <p className="text-ink">Note: {order.deliveryNote}</p>}
              {order.deliveryPhotoUrl && (
                <a href={assetUrl(order.deliveryPhotoUrl)} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- served by the API */}
                  <img src={assetUrl(order.deliveryPhotoUrl)} alt="Delivery photo" className="mt-1 h-28 rounded-lg border border-line object-cover" />
                </a>
              )}
            </div>
          )}
          {order.exceptions.length > 0 && (
            <ul className="flex flex-col gap-2">
              {order.exceptions.map((x) => (
                <li key={x.id} className="rounded-lg border border-danger/30 bg-danger/5 p-3">
                  <p className="font-medium text-danger">
                    {EXCEPTION_LABELS[x.type]}
                    {x.variant && ` — ${x.variant.name} (${x.variant.code})`}
                  </p>
                  {x.location && <p className="text-xs text-muted">Responsible place: {x.location.name}</p>}
                  <p className="text-ink">{x.note}</p>
                  <p className="text-xs text-muted">
                    {x.reportedBy.name} · {new Date(x.createdAt).toLocaleString()}
                  </p>
                  {x.photoUrl && (
                    <a href={assetUrl(x.photoUrl)} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- served by the API */}
                      <img src={assetUrl(x.photoUrl)} alt="" className="mt-2 h-24 rounded-lg border border-line object-cover" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Items */}
      <section className="mb-4 rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="font-semibold text-ink">Items</h2>
          {order.status !== "NEW" && (
            <span className="text-sm text-muted">
              {pickedUnits} / {totalUnits} picked
            </span>
          )}
        </div>
        <ul className="divide-y divide-line">
          {order.lines.map((l) => (
            <li key={l.id} className="flex items-start gap-3 p-4">
              <Thumb src={l.variant.product.images[0]} size="size-10" />
              <div className="min-w-0 flex-1">
                <p className="text-ink">
                  {l.quantity} × {l.description}
                </p>
                {order.needs
                  .filter((n) => n.lineId === l.id && (l.variant.kind === "KIT" || order.status !== "NEW"))
                  .map((n) => (
                    <p key={n.variantId} className={`text-xs ${n.picked >= n.quantity ? "text-ok" : "text-muted"}`}>
                      {l.variant.kind === "KIT" ? n.name.split(", ").slice(-1)[0] : "Picked"}: {n.picked}/{n.quantity}
                    </p>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Allocation / pick list */}
      {order.allocations.length > 0 && (
        <section className="mb-4 rounded-xl border border-line bg-white">
          <h2 className="border-b border-line p-4 font-semibold text-ink">Pick list</h2>
          {[...bySite.entries()].map(([site, allocations]) => (
            <div key={site} className="border-b border-line last:border-0">
              <p className="bg-surface px-4 py-2 text-sm font-semibold text-ink">{site}</p>
              <ul className="divide-y divide-line">
                {allocations.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{a.variant.product.name}{a.variant.kind === "COMPONENT" ? `, ${a.variant.name.split(" – ")[0]}` : a.variant.name !== "Default" ? ` – ${a.variant.name}` : ""}</span>
                      <span className="text-xs text-muted">{a.path.split(" › ").slice(1).join(" › ")}</span>
                    </span>
                    <span className={`shrink-0 tabular-nums ${a.picked >= a.quantity - a.released ? "text-ok" : "text-ink"}`}>
                      {a.picked}/{a.quantity}
                      {a.released > 0 && <span className="ml-1 text-xs text-danger">({a.released} missing)</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {order.status === "NEW" && canWrite && <Button onClick={() => setDialog("allocate")}>Reserve stock…</Button>}
        {(order.status === "ALLOCATED" || order.status === "PICKING") && canPick && (
          <Link href={`/orders/${order.id}/pick`} className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">
            📦 {order.status === "PICKING" ? "Continue picking" : "Start picking"}
          </Link>
        )}
        {order.status === "ALLOCATED" && canWrite && (
          <Button variant="secondary" onClick={() => action("unallocate")} disabled={busy}>
            Change reservation
          </Button>
        )}
        {can(user?.role, "delivery") && ["LOADED", "OUT_FOR_DELIVERY", "FAILED"].includes(order.status) && (
          <Link href={`/deliveries/${order.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">
            🚚 Delivery screen
          </Link>
        )}
        {["NEW", "ALLOCATED", "PICKING", "LOADED", "OUT_FOR_DELIVERY", "FAILED"].includes(order.status) && canWrite && (
          <Button variant="ghost" className="text-danger" onClick={() => setDialog("cancel")}>
            Cancel order
          </Button>
        )}
      </div>

      {order.awaitingReturn && canPick && <ReturnScanner order={order} onChange={setOrder} />}

      <Modal title="Reserve stock" open={dialog === "allocate"} onClose={() => setDialog(null)}>
        {dialog === "allocate" && <AllocationEditor orderId={order.id} onDone={(o) => (setOrder(o), setDialog(null))} />}
      </Modal>
      <Modal title="Cancel order" open={dialog === "cancel"} onClose={() => setDialog(null)}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            action("cancel", { reason: cancelReason });
          }}
        >
          <p className="text-sm text-muted">
            Reserved stock is released. {order.inTransit > 0 && `${order.inTransit} item(s) are already loaded — they stay In Transit until scanned back in.`}
          </p>
          <Field label="Reason">{(id) => <Input id={id} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} required maxLength={300} autoFocus />}</Field>
          <Button type="submit" variant="danger" disabled={busy}>
            Cancel order
          </Button>
        </form>
      </Modal>
    </div>
  );
}
