"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApprovalForm, type Approval } from "@/components/approval-form";
import { CameraScanner } from "@/components/camera-scanner";
import { LocationPicker } from "@/components/location-picker";
import { Thumb } from "@/components/thumb";
import { Alert, Button, Input, Modal, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { scanError, scanSuccess } from "@/lib/feedback";
import { stockableLocations } from "@/lib/stock";
import type { Location, Order } from "@/lib/types";

interface PickResult {
  item: string;
  from: string;
  leftOfThisItem: number;
  override: boolean;
  order: Order;
}

/**
 * Picking: stand at a space (choose it or scan its label), scan each item. Every scan is checked
 * — right item / box, right place, not too many — and loads the unit onto the van (In Transit).
 */
export default function PickPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [hereId, setHereId] = useState("");
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  /** The last scan refused for "wrong location" — can be retried with a manager's approval. */
  const [override, setOverride] = useState<{ code: string; text: string } | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [shortOpen, setShortOpen] = useState(false);
  const hereRef = useRef("");
  const busy = useRef(false);

  useEffect(() => {
    api<Order>(`/orders/${id}`)
      .then((o) => {
        setOrder(o);
        // Start at the first place with something left to pick.
        const next = o.allocations.find((a) => a.picked + a.released < a.quantity);
        if (next) setHereId(next.locationId);
      })
      .catch((e) => setMessage({ kind: "error", text: e.message }));
    api<Location[]>("/locations").then(setLocations).catch(() => undefined);
  }, [id]);
  useEffect(() => {
    hereRef.current = hereId;
  }, [hereId]);

  // The places on the pick list first, then every other space (for picking somewhere else, with approval).
  const options = useMemo(() => {
    const listed = new Set(order?.allocations.map((a) => a.locationId));
    const all = stockableLocations(locations, user);
    return [...all.filter((l) => listed.has(l.id)), ...all.filter((l) => !listed.has(l.id))].map((location) => ({
      location,
      hint: listed.has(location.id) ? "on pick list" : undefined,
    }));
  }, [order, locations, user]);

  const send = useCallback(
    async (value: string, approval?: Approval) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await api<PickResult>(`/orders/${id}/pick`, {
          method: "POST",
          body: { code: value, locationId: hereRef.current, ...(approval && { approval: { login: approval.login, password: approval.password }, reason: approval.reason }) },
        });
        scanSuccess();
        setOrder(res.order);
        setOverride(null);
        setOverrideOpen(false);
        setMessage({ kind: "success", text: `✓ ${res.item}${res.override ? " (approved from a different place)" : ""}${res.leftOfThisItem ? ` — ${res.leftOfThisItem} more to pick` : ""}` });
      } catch (e) {
        scanError();
        if (e instanceof ApiError && e.code === "WRONG_LOCATION" && !approval) {
          setOverride({ code: value, text: e.message });
          setMessage({ kind: "error", text: e.message });
        } else {
          if (approval) throw e;
          setMessage({ kind: "error", text: e instanceof Error ? e.message : "Scan failed" });
        }
      } finally {
        busy.current = false;
      }
    },
    [id],
  );

  const onScan = useCallback(
    (raw: string) => {
      const value = raw.trim();
      if (!value) return;
      // A location label means "I'm standing here now".
      const loc = locations.find((l) => l.code === value.toUpperCase());
      if (loc) {
        setHereId(loc.id);
        scanSuccess();
        setMessage({ kind: "success", text: `Now at ${loc.path}` });
        return;
      }
      if (!hereRef.current) {
        scanError();
        setMessage({ kind: "error", text: "First choose (or scan the label of) the place you're picking from" });
        return;
      }
      send(value);
    },
    [locations, send],
  );

  if (!order) return message ? <Alert>{message.text}</Alert> : <Spinner />;

  const open = order.status === "ALLOCATED" || order.status === "PICKING";
  const total = order.allocations.reduce((s, a) => s + a.quantity - a.released, 0);
  const picked = order.allocations.reduce((s, a) => s + a.picked, 0);
  const bySite = new Map<string, Order["allocations"]>();
  for (const a of order.allocations) bySite.set(a.site, [...(bySite.get(a.site) ?? []), a]);

  return (
    <div className="mx-auto max-w-2xl pb-10">
      <Link href={`/orders/${order.id}`} className="mb-4 inline-block text-sm text-brand">
        ← {order.orderNumber}
      </Link>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Picking</h1>
          <p className="text-sm text-muted">
            {order.orderNumber} · {order.customerName}
          </p>
        </div>
        <p className="text-2xl font-semibold tabular-nums text-ink">
          {picked}/{total}
        </p>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface">
        <div className="h-full bg-ok transition-all" style={{ width: `${total ? (picked / total) * 100 : 0}%` }} />
      </div>

      {order.status === "LOADED" && (
        <div className="mb-4">
          <Alert kind="success">All picked and loaded — the items are now In Transit.</Alert>
        </div>
      )}
      {message && (
        <div className="mb-4">
          <Alert kind={message.kind}>{message.text}</Alert>
        </div>
      )}
      {override && (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-brand/30 bg-brand/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink">Item really here instead? A manager can approve picking it from this place.</p>
          <Button variant="secondary" onClick={() => setOverrideOpen(true)} className="shrink-0" aria-haspopup="dialog">
            Manager override…
          </Button>
        </div>
      )}

      {open && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
          <LocationPicker label="I'm at" options={options} value={hereId} onChange={setHereId} />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onScan(code);
              setCode("");
            }}
          >
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan each item / box" autoComplete="off" aria-label="Scan item" />
            <Button type="button" variant="secondary" onClick={() => setCamera((v) => !v)} aria-pressed={camera}>
              📷
            </Button>
          </form>
          {camera && <CameraScanner onScan={onScan} />}
        </div>
      )}

      {[...bySite.entries()].map(([site, allocations]) => (
        <section key={site} className="mb-3 overflow-hidden rounded-xl border border-line bg-white">
          <h2 className="bg-surface px-4 py-2 text-sm font-semibold text-ink">{site}</h2>
          <ul className="divide-y divide-line">
            {allocations.map((a) => {
              const done = a.picked >= a.quantity - a.released;
              return (
                <li key={a.id} className={`flex items-center gap-3 px-4 py-3 ${a.locationId === hereId && !done ? "bg-brand/5" : ""}`}>
                  <Thumb src={a.variant.product.images[0]} size="size-12" />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium ${done ? "text-muted line-through" : "text-ink"}`}>
                      {a.variant.product.name}
                      {a.variant.kind === "COMPONENT" ? `, ${a.variant.name.split(" – ")[0]}` : a.variant.name !== "Default" ? ` – ${a.variant.name}` : ""}
                    </p>
                    <p className="text-sm text-muted">{a.path.split(" › ").slice(1).join(" › ")}</p>
                  </div>
                  <span className={`shrink-0 text-lg font-semibold tabular-nums ${done ? "text-ok" : "text-ink"}`}>
                    {done ? "✓" : `${a.picked}/${a.quantity - a.released}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {open && picked > 0 && picked < total && (
        <Button variant="ghost" className="mt-2 text-danger" onClick={() => setShortOpen(true)}>
          Something is missing — finish without it (manager)
        </Button>
      )}

      <Modal title="Pick from a different place" open={!!override && overrideOpen} onClose={() => setOverrideOpen(false)}>
        {override && (
          <ApprovalForm
            explanation={`${override.text}. If it is really here, a manager can approve taking it from this place instead; the reservation moves with it.`}
            submitLabel="Approve & pick from here"
            onSubmit={(a) => send(override.code, a)}
          />
        )}
      </Modal>
      <Modal title="Finish with items missing" open={shortOpen} onClose={() => setShortOpen(false)}>
        <ApprovalForm
          explanation="Items not picked yet are released (their reservation is given back) and the order goes out without them. A manager must approve."
          submitLabel="Approve & finish"
          onSubmit={async (a) => {
            const o = await api<Order>(`/orders/${id}/short`, { method: "POST", body: { approval: { login: a.login, password: a.password }, reason: a.reason } });
            setOrder(o);
            setShortOpen(false);
            setMessage({ kind: "success", text: "Finished with missing items (approved)." });
          }}
        />
      </Modal>
    </div>
  );
}
