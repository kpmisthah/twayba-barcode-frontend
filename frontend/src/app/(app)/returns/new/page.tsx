"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CameraScanner } from "@/components/camera-scanner";
import { LocationPicker } from "@/components/location-picker";
import { PageHeader } from "@/components/page-header";
import { Alert, Button, Field, Input, Select, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { downloadPdf } from "@/lib/download";
import { scanError, scanSuccess } from "@/lib/feedback";
import { formatMoney } from "@/lib/settings";
import { stockableLocations } from "@/lib/stock";
import { PAYMENT_LABELS, type CreditNote, type Location, type PaymentMethod, type ReturnCondition, type Sale } from "@/lib/types";

export default function NewReturnPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <NewReturn />
    </Suspense>
  );
}

interface LineState {
  quantity: string;
  condition: ReturnCondition;
  locationId: string;
}

function NewReturn() {
  const saleParam = useSearchParams().get("sale");
  const [sale, setSale] = useState<Sale | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<CreditNote | null>(null);

  useEffect(() => {
    api<Location[]>("/locations").then(setLocations).catch((e) => setError(e.message));
    if (saleParam) api<Sale>(`/sales/${saleParam}`).then(setSale).catch((e) => setError(e.message));
  }, [saleParam]);

  async function find(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setError("");
    try {
      setSale(await api<Sale>(`/sales/by-number/${encodeURIComponent(value)}`));
      scanSuccess();
      setCamera(false);
    } catch (e) {
      scanError();
      setError(e instanceof ApiError && e.status === 404 ? `No invoice "${value}"` : e instanceof Error ? e.message : "Lookup failed");
    }
  }

  if (done)
    return (
      <ReturnDone
        note={done}
        onNew={() => {
          setDone(null);
          setSale(null);
          setCode("");
        }}
      />
    );

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/returns" className="mb-4 inline-block text-sm text-brand">
        ← Returns
      </Link>
      <PageHeader title="New return" description="Find the invoice: scan the barcode at the bottom of the receipt, or type the invoice number." />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {!sale ? (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              find(code);
            }}
          >
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="INV-000123" autoFocus autoComplete="off" aria-label="Invoice number" />
            <Button type="submit">Find</Button>
            <Button type="button" variant="secondary" onClick={() => setCamera((v) => !v)} aria-pressed={camera}>
              📷
            </Button>
          </form>
          {camera && <CameraScanner onScan={find} />}
          <p className="text-sm text-muted">
            Or find it on the <Link href="/sales" className="text-brand">Sales</Link> page and tap “Return items”.
          </p>
        </div>
      ) : (
        <ReturnForm sale={sale} locations={locations} onDone={setDone} onChangeSale={() => setSale(null)} />
      )}
    </div>
  );
}

function ReturnForm({
  sale,
  locations,
  onDone,
  onChangeSale,
}: {
  sale: Sale;
  locations: Location[];
  onDone: (note: CreditNote) => void;
  onChangeSale: () => void;
}) {
  const { user } = useAuth();
  const money = (v: string | number) => formatMoney(String(v), sale.currency);
  const destinations = useMemo(() => stockableLocations(locations, user).map((location) => ({ location })), [locations, user]);
  const [lines, setLines] = useState<Record<string, LineState>>(() =>
    // Good items go back where they came from, by default.
    Object.fromEntries(sale.lines.map((l) => [l.id, { quantity: "0", condition: "GOOD" as const, locationId: l.picks[0]?.locationId ?? "" }])),
  );
  const [method, setMethod] = useState<PaymentMethod>(sale.payments[0]?.method ?? "CASH");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const returnable = (l: Sale["lines"][number]) => l.quantity - l.returnLines.reduce((s, r) => s + r.quantity, 0);
  const chosen = sale.lines.filter((l) => Number(lines[l.id].quantity) > 0);
  // Estimate only; the server works out the exact refund (the last unit gets exactly what's left).
  const estimate = chosen.reduce((s, l) => s + (Number(l.total) * Number(lines[l.id].quantity)) / l.quantity, 0);
  const update = (id: string, patch: Partial<LineState>) => setLines({ ...lines, [id]: { ...lines[id], ...patch } });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen.length) return setError("Choose how many of each item is coming back");
    setSaving(true);
    setError("");
    try {
      const note = await api<CreditNote>("/returns", {
        method: "POST",
        body: {
          saleId: sale.id,
          refundMethod: method,
          refundReference: reference || undefined,
          reason: reason || undefined,
          lines: chosen.map((l) => ({
            saleLineId: l.id,
            quantity: Number(lines[l.id].quantity),
            condition: lines[l.id].condition,
            locationId: lines[l.id].condition === "GOOD" ? lines[l.id].locationId : undefined,
          })),
        },
      });
      onDone(note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process the return");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-white p-4">
        <div>
          <p className="font-mono font-semibold text-ink">{sale.invoiceNumber}</p>
          <p className="text-sm text-muted">
            {new Date(sale.createdAt).toLocaleString()} · {money(sale.total)}
            {sale.customerName && ` · ${sale.customerName}`}
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={onChangeSale}>
          Change
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}

      <ul className="flex flex-col gap-3">
        {sale.lines.map((l) => {
          const left = returnable(l);
          const s = lines[l.id];
          return (
            <li key={l.id} className="rounded-xl border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{l.description}</p>
                  <p className="text-sm text-muted">
                    Bought {l.quantity} × {money(l.unitPrice)}
                    {Number(l.discountAmount) > 0 && ` (−${Number(l.discountPercent)}%)`} · {left} can be returned
                  </p>
                </div>
              </div>
              {left > 0 ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_10rem_1fr]">
                  <Field label="Returning">
                    {(id) => (
                      <Input id={id} type="number" inputMode="numeric" min={0} max={left} value={s.quantity} onChange={(e) => update(l.id, { quantity: e.target.value })} />
                    )}
                  </Field>
                  <Field label="Condition">
                    {(id) => (
                      <Select id={id} value={s.condition} onChange={(e) => update(l.id, { condition: e.target.value as ReturnCondition })}>
                        <option value="GOOD">Good — back to stock</option>
                        <option value="DAMAGED">Damaged</option>
                      </Select>
                    )}
                  </Field>
                  {s.condition === "GOOD" ? (
                    <LocationPicker label="Put back in" options={destinations} value={s.locationId} onChange={(locationId) => update(l.id, { locationId })} />
                  ) : (
                    <p className="self-end pb-3 text-sm text-muted">Goes to the Damaged location.</p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">Already fully returned.</p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2">
        <Field label="Refund by">
          {(id) => (
            <Select id={id} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_LABELS[m]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Refund reference (optional)">{(id) => <Input id={id} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />}</Field>
        <div className="sm:col-span-2">
          <Field label="Reason (optional)">{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. wrong colour" />}</Field>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Refund about <span className="text-lg font-semibold text-ink">{money(estimate.toFixed(2))}</span>
        </p>
        <Button type="submit" disabled={saving || !chosen.length} className="min-h-12">
          {saving ? "Processing…" : "Refund & create credit note"}
        </Button>
      </div>
    </form>
  );
}

function ReturnDone({ note, onNew }: { note: CreditNote; onNew: () => void }) {
  const [error, setError] = useState("");
  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="rounded-xl bg-ok/10 p-5 text-center">
        <p className="text-sm text-ok">✓ Return done — credit note {note.creditNumber}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-ink">{formatMoney(note.total, note.sale.currency)}</p>
        <p className="text-sm text-muted">to refund by {PAYMENT_LABELS[note.refundMethod]}</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <Button variant="secondary" onClick={() => downloadPdf(`/returns/${note.id}/pdf`, `${note.creditNumber}.pdf`).catch((e) => setError(e.message))}>
        ⬇ Download credit note (PDF)
      </Button>
      <div className="flex gap-2">
        <Button onClick={onNew} className="flex-1">
          New return
        </Button>
        <Link href={`/sales/${note.sale.id}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink">
          View invoice
        </Link>
      </div>
    </div>
  );
}
