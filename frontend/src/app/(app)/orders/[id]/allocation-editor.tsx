"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Input, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { AllocationSuggestion, Order } from "@/lib/types";

interface Row {
  key: number;
  lineId: string;
  variantId: string;
  locationId: string;
  quantity: string;
}

let seq = 0;

/** Starts from the system's suggestion; the manager can change locations or split quantities, then reserve. */
export function AllocationEditor({ orderId, onDone }: { orderId: string; onDone: (order: Order) => void }) {
  const [suggestion, setSuggestion] = useState<AllocationSuggestion | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<AllocationSuggestion>(`/orders/${orderId}/suggestion`)
      .then((s) => {
        setSuggestion(s);
        setRows(s.allocations.map((a) => ({ key: ++seq, lineId: a.lineId, variantId: a.variantId, locationId: a.locationId, quantity: String(a.quantity) })));
      })
      .catch((e) => setError(e.message));
  }, [orderId]);

  if (error && !suggestion) return <Alert>{error}</Alert>;
  if (!suggestion) return <Spinner />;

  const update = (key: number, patch: Partial<Row>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const sourcesFor = (variantId: string) => suggestion.sources.filter((s) => s.variantId === variantId);
  const totalFor = (lineId: string, variantId: string) =>
    rows.filter((r) => r.lineId === lineId && r.variantId === variantId).reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const allMatch = suggestion.needs.every((n) => totalFor(n.lineId, n.variantId) === n.quantity);

  async function confirm() {
    setSaving(true);
    setError("");
    try {
      const order = await api<Order>(`/orders/${orderId}/allocate`, {
        method: "POST",
        body: { allocations: rows.filter((r) => Number(r.quantity) > 0).map((r) => ({ lineId: r.lineId, variantId: r.variantId, locationId: r.locationId, quantity: Number(r.quantity) })) },
      });
      onDone(order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reserve the stock");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      {suggestion.short.length > 0 && (
        <Alert>
          Not enough free stock for:{" "}
          {suggestion.short.map((s) => `${suggestion.needs.find((n) => n.lineId === s.lineId && n.variantId === s.variantId)?.name} (${s.missing} missing)`).join(", ")}. Add or
          move stock first, then come back.
        </Alert>
      )}
      {suggestion.needs.map((n) => {
        const total = totalFor(n.lineId, n.variantId);
        const options = sourcesFor(n.variantId);
        return (
          <div key={`${n.lineId}:${n.variantId}`} className="rounded-lg border border-line p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-medium text-ink">{n.name}</p>
              <span className={`text-sm tabular-nums ${total === n.quantity ? "text-ok" : "text-danger"}`}>
                {total} / {n.quantity}
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {rows
                .filter((r) => r.lineId === n.lineId && r.variantId === n.variantId)
                .map((r) => (
                  <li key={r.key} className="flex gap-2">
                    <Select value={r.locationId} onChange={(e) => update(r.key, { locationId: e.target.value })} aria-label={`Location for ${n.name}`}>
                      {options.map((o) => (
                        <option key={o.locationId} value={o.locationId}>
                          {o.path} — {o.available} free
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={r.quantity}
                      onChange={(e) => update(r.key, { quantity: e.target.value })}
                      className="w-20!"
                      aria-label={`Quantity of ${n.name}`}
                    />
                    <button type="button" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} className="px-2 text-muted" aria-label="Remove">
                      ✕
                    </button>
                  </li>
                ))}
            </ul>
            {options.length > 0 && total < n.quantity && (
              <button
                type="button"
                className="mt-2 text-sm text-brand"
                onClick={() => setRows([...rows, { key: ++seq, lineId: n.lineId, variantId: n.variantId, locationId: options[0].locationId, quantity: String(n.quantity - total) }])}
              >
                + take some from another place
              </button>
            )}
          </div>
        );
      })}
      <Button onClick={confirm} disabled={saving || !allMatch}>
        {saving ? "Reserving…" : "Confirm & reserve stock"}
      </Button>
    </div>
  );
}
