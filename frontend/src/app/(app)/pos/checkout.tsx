"use client";

import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { formatMoney } from "@/lib/settings";
import { PAYMENT_LABELS, type PaymentMethod } from "@/lib/types";

export interface CheckoutResult {
  payments: { method: PaymentMethod; amount: number; reference?: string }[];
  customerName?: string;
  customerPhone?: string;
  approval?: { login: string; password: string };
}

interface PaymentRow {
  method: PaymentMethod;
  amount: string;
  reference: string;
}

const cents = (v: string | number) => Math.round(Number(v) * 100) || 0;
const euros = (c: number) => (c / 100).toFixed(2);

/** Customer (optional), payments (split allowed, cash change) and manager approval if needed. */
export function Checkout({
  total,
  currency,
  needsApproval,
  maxDiscountPercent,
  onComplete,
}: {
  total: string;
  currency?: string;
  needsApproval: boolean;
  maxDiscountPercent: number;
  onComplete: (result: CheckoutResult) => Promise<void>;
}) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const totalCents = cents(total);
  const paidCents = rows.reduce((s, r) => s + cents(r.amount), 0);
  const cashCents = rows.filter((r) => r.method === "CASH").reduce((s, r) => s + cents(r.amount), 0);
  const remaining = totalCents - paidCents;
  const change = -remaining;
  const money = (c: number) => formatMoney(euros(c), currency);
  const problem =
    remaining > 0 ? `${money(remaining)} still to pay` : change > cashCents ? "Only cash can be more than the amount due" : "";

  function add(method: PaymentMethod) {
    setRows([...rows, { method, amount: euros(Math.max(remaining, 0)), reference: "" }]);
  }
  const update = (i: number, patch: Partial<PaymentRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  /** Exact amount, then the next note up: €5, €10, €20, €50. */
  function cashSuggestions(i: number) {
    const due = totalCents - rows.reduce((s, r, j) => (j === i ? s : s + cents(r.amount)), 0);
    if (due <= 0) return [];
    const options = new Set([due]);
    for (const note of [500, 1000, 2000, 5000]) options.add(Math.ceil(due / note) * note);
    return [...options].slice(0, 4);
  }

  async function complete() {
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    try {
      await onComplete({
        payments: rows.filter((r) => cents(r.amount) > 0).map((r) => ({ method: r.method, amount: cents(r.amount) / 100, reference: r.reference || undefined })),
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        approval: needsApproval ? { login, password } : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the sale");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-surface p-4 text-center">
        <p className="text-sm text-muted">Total to pay</p>
        <p className="text-3xl font-semibold tabular-nums text-ink">{money(totalCents)}</p>
      </div>

      {error && <Alert>{error}</Alert>}

      <div>
        <p className="mb-2 text-sm font-medium text-ink">Payment</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
            <Button key={m} type="button" variant="secondary" onClick={() => add(m)}>
              {PAYMENT_LABELS[m]}
            </Button>
          ))}
        </div>
      </div>

      {rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={i} className="rounded-lg border border-line p-3">
              <div className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-sm font-medium text-ink">{PAYMENT_LABELS[r.method]}</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={r.amount}
                  onChange={(e) => update(i, { amount: e.target.value })}
                  aria-label={`${PAYMENT_LABELS[r.method]} amount`}
                />
                <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove payment" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface">
                  ✕
                </button>
              </div>
              {r.method === "CASH" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {cashSuggestions(i).map((c) => (
                    <button key={c} type="button" onClick={() => update(i, { amount: euros(c) })} className="min-h-10 rounded-lg border border-line px-3 text-sm tabular-nums hover:bg-surface">
                      {money(c)}
                    </button>
                  ))}
                </div>
              )}
              {(r.method === "CARD" || r.method === "BANK_TRANSFER") && (
                <Input
                  className="mt-2"
                  placeholder={r.method === "CARD" ? "Card slip / last 4 digits (optional)" : "Transfer reference (optional)"}
                  value={r.reference}
                  onChange={(e) => update(i, { reference: e.target.value })}
                  maxLength={100}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-between rounded-lg border border-line p-3 text-sm">
        <span className="text-muted">{remaining > 0 ? "Still to pay" : "Change to give"}</span>
        <span className={`text-lg font-semibold tabular-nums ${remaining > 0 ? "text-danger" : "text-ok"}`}>{money(Math.abs(remaining))}</span>
      </div>

      <details className="rounded-lg border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">Customer (optional)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Name">{(id) => <Input id={id} value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={100} />}</Field>
          <Field label="Phone">{(id) => <Input id={id} type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} maxLength={30} />}</Field>
        </div>
      </details>

      {needsApproval && (
        <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
          <p className="text-sm font-medium text-ink">Manager approval needed</p>
          <p className="mb-3 text-sm text-muted">A discount is above {maxDiscountPercent}%. An admin or manager enters their login here.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Manager email or phone">{(id) => <Input id={id} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" />}</Field>
            <Field label="Manager password">
              {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}
            </Field>
          </div>
        </div>
      )}

      <Button type="button" onClick={complete} disabled={busy || rows.length === 0 || !!problem || (needsApproval && (!login || !password))}>
        {busy ? "Completing…" : "Complete sale"}
      </Button>
    </div>
  );
}
