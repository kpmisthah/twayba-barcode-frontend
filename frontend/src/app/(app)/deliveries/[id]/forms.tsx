"use client";

import { useState } from "react";
import { PhotoInput } from "@/components/photo-input";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { scanError, scanSuccess } from "@/lib/feedback";
import { allocationName, onVan } from "@/lib/orders";
import { formatMoney } from "@/lib/settings";
import { lookupCode } from "@/lib/stock";
import { EXCEPTION_LABELS, type DeliveryExceptionType, type Order } from "@/lib/types";

/**
 * The second scan: confirm delivery. Scanning the items is optional (a check against the van);
 * one tap confirms everything. If the customer kept only part, list what they took — that needs
 * a manager, and the rest stays on the van to be scanned back in.
 */
export function DeliveredForm({ order, isApprover, onDone }: { order: Order; isApprover: boolean; onDone: (o: Order) => void }) {
  const van = onVan(order);
  const [scanned, setScanned] = useState<Record<string, number>>({});
  const [code, setCode] = useState("");
  const [partial, setPartial] = useState(false);
  const [taken, setTaken] = useState<Record<string, string>>(() => Object.fromEntries(van.map((v) => [v.variantId, String(v.quantity)])));
  const [cod, setCod] = useState(order.codAmount ?? "");
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const allScanned = van.every((v) => (scanned[v.variantId] ?? 0) >= v.quantity);

  async function scan(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim();
    setCode("");
    if (!value) return;
    try {
      const item = await lookupCode(value);
      const row = van.find((v) => v.variantId === item.variantId);
      if (!row) throw new Error(`${item.productName} is not on the van for this order`);
      if ((scanned[row.variantId] ?? 0) >= row.quantity) throw new Error(`All ${row.quantity} × ${row.name} already checked`);
      setScanned({ ...scanned, [row.variantId]: (scanned[row.variantId] ?? 0) + 1 });
      scanSuccess();
      setError("");
    } catch (err) {
      scanError();
      setError(err instanceof Error ? err.message : "Unknown code");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const items = partial ? van.map((v) => ({ variantId: v.variantId, quantity: Number(taken[v.variantId]) || 0 })).filter((i) => i.quantity > 0) : undefined;
      const next = await api<Order>(`/orders/${order.id}/deliver`, {
        method: "POST",
        body: {
          items,
          codCollected: order.paymentStatus === "COD" ? Number(cod) : undefined,
          recipientName: recipient || undefined,
          note: note || undefined,
          photoUrl: photo ?? undefined,
          approval: partial && !isApprover ? { login, password } : undefined,
        },
      });
      onDone(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm the delivery");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}

      <div className="rounded-lg border border-line">
        <ul className="divide-y divide-line">
          {van.map((v) => {
            const n = scanned[v.variantId] ?? 0;
            return (
              <li key={v.variantId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className={n >= v.quantity ? "text-ok" : "text-ink"}>
                  {n >= v.quantity ? "✓ " : ""}
                  {v.name}
                </span>
                {partial ? (
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={v.quantity}
                    value={taken[v.variantId]}
                    onChange={(e) => setTaken({ ...taken, [v.variantId]: e.target.value })}
                    className="h-10 min-h-10! w-20!"
                    aria-label={`Delivered ${v.name}`}
                  />
                ) : (
                  <span className="tabular-nums text-muted">
                    {n}/{v.quantity}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line p-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && scan(e)}
            placeholder="Optional: scan each item as you hand it over"
            autoComplete="off"
            aria-label="Scan to check"
          />
        </div>
      </div>
      {allScanned && van.length > 0 && <p className="-mt-2 text-sm text-ok">✓ Every item checked</p>}

      {order.paymentStatus === "COD" && (
        <Field label={`Cash collected (expected ${formatMoney(order.codAmount)})`}>
          {(id) => <Input id={id} type="number" inputMode="decimal" min={0} step="0.01" value={cod} onChange={(e) => setCod(e.target.value)} required />}
        </Field>
      )}
      <Field label="Received by (optional)">{(id) => <Input id={id} value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={100} placeholder="e.g. customer, neighbour…" />}</Field>
      <PhotoInput value={photo} onChange={setPhoto} label="Photo of the delivery (optional)" />

      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" className="mt-0.5 size-4" checked={partial} onChange={(e) => setPartial(e.target.checked)} />
        The customer didn&rsquo;t take everything
      </label>
      {partial && (
        <div className="flex flex-col gap-3 rounded-lg border border-brand/30 bg-brand/5 p-3">
          <p className="text-sm text-muted">Set how many of each item the customer kept above. The rest stays on the van — scan it back in at the warehouse.</p>
          <Field label="Why?">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} required maxLength={1000} />}</Field>
          {!isApprover && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Manager email or phone">{(id) => <Input id={id} value={login} onChange={(e) => setLogin(e.target.value)} required autoComplete="off" />}</Field>
              <Field label="Manager password">
                {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />}
              </Field>
            </div>
          )}
        </div>
      )}
      {!partial && <Field label="Note (optional)">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />}</Field>}

      <Button type="submit" disabled={saving} className="min-h-14 bg-ok text-base hover:bg-ok/90">
        {saving ? "Saving…" : partial ? "Confirm partial delivery" : "Confirm delivered"}
      </Button>
    </form>
  );
}

const FAIL_REASONS: DeliveryExceptionType[] = ["NOT_HOME", "CUSTOMER_REFUSED", "WRONG_ADDRESS", "DAMAGED_BOX", "MISSING_BOX", "OTHER"];

/** Delivery failed: the goods stay on the van (In Transit) until delivered again or scanned back in. */
export function FailForm({ order, onDone }: { order: Order; onDone: (o: Order) => void }) {
  const [reason, setReason] = useState<DeliveryExceptionType>("NOT_HOME");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      onDone(await api<Order>(`/orders/${order.id}/fail`, { method: "POST", body: { reason, note, photoUrl: photo ?? undefined } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <p className="text-sm text-muted">Everything stays on the van. You can try again later, or bring it back and scan it into stock.</p>
      <Field label="What happened?">
        {(id) => (
          <Select id={id} value={reason} onChange={(e) => setReason(e.target.value as DeliveryExceptionType)}>
            {FAIL_REASONS.map((r) => (
              <option key={r} value={r}>
                {EXCEPTION_LABELS[r]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Details">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} required maxLength={1000} placeholder="e.g. rang twice, no answer" />}</Field>
      <PhotoInput value={photo} onChange={setPhoto} />
      <Button type="submit" variant="danger" disabled={saving}>
        {saving ? "Saving…" : "Mark as not delivered"}
      </Button>
    </form>
  );
}

/** Missing / damaged box or any other problem — logged with notes and a photo; doesn't change the order. */
export function ProblemForm({ order, onDone }: { order: Order; onDone: (o: Order) => void }) {
  const items = [...new Map(order.allocations.map((a) => [a.variantId, a])).values()];
  const [type, setType] = useState<DeliveryExceptionType>("DAMAGED_BOX");
  const [variantId, setVariantId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Places this item was taken from — the likely responsible location.
  const places = [...new Map(order.allocations.filter((a) => !variantId || a.variantId === variantId).map((a) => [a.locationId, a])).values()];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      onDone(
        await api<Order>(`/orders/${order.id}/exceptions`, {
          method: "POST",
          body: { type, variantId: variantId || undefined, locationId: locationId || undefined, note, photoUrl: photo ?? undefined },
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not report");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <Field label="Problem">
        {(id) => (
          <Select id={id} value={type} onChange={(e) => setType(e.target.value as DeliveryExceptionType)}>
            {(["DAMAGED_BOX", "MISSING_BOX", "OTHER"] as DeliveryExceptionType[]).map((t) => (
              <option key={t} value={t}>
                {EXCEPTION_LABELS[t]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Which item / box?">
        {(id) => (
          <Select id={id} value={variantId} onChange={(e) => (setVariantId(e.target.value), setLocationId(""))}>
            <option value="">Not about one item</option>
            {items.map((a) => (
              <option key={a.variantId} value={a.variantId}>
                {allocationName(a)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {places.length > 0 && (
        <Field label="Which place is responsible?" hint="Where this item was picked up from">
          {(id) => (
            <Select id={id} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Don&rsquo;t know</option>
              {places.map((a) => (
                <option key={a.locationId} value={a.locationId}>
                  {a.path}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <Field label="Details">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} required maxLength={1000} />}</Field>
      <PhotoInput value={photo} onChange={setPhoto} />
      <Button type="submit" disabled={saving}>
        {saving ? "Sending…" : "Report"}
      </Button>
    </form>
  );
}
