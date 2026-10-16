"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { downloadPdf, openPdf } from "@/lib/download";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/settings";
import { PAYMENT_LABELS, type Sale } from "@/lib/types";

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });

export default function SalePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canReturn = can(user?.role, "pos");
  const [sale, setSale] = useState<Sale | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Sale>(`/sales/${id}`)
      .then(setSale)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error && !sale) return <Alert>{error}</Alert>;
  if (!sale) return <Spinner />;

  const money = (v: string) => formatMoney(v, sale.currency);
  const run = (fn: () => Promise<void>) => fn().catch((e) => setError(e instanceof Error ? e.message : "Could not get the PDF"));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/sales" className="mb-4 inline-block text-sm text-brand">
        ← Sales
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold text-ink">{sale.invoiceNumber}</h1>
          <p className="mt-1 text-sm text-muted">
            {dateTime.format(new Date(sale.createdAt))}
            {sale.site && ` · ${sale.site.name}`} · served by {sale.cashier.name}
          </p>
          {sale.approvedBy && <p className="text-sm text-muted">Discount approved by {sale.approvedBy.name}</p>}
          {(sale.customerName || sale.customerPhone) && (
            <p className="mt-1 text-sm text-ink">Customer: {[sale.customerName, sale.customerPhone].filter(Boolean).join(", ")}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canReturn && sale.lines.some((l) => l.quantity > l.returnLines.reduce((s, r) => s + r.quantity, 0)) && (
            <Link
              href={`/returns/new?sale=${sale.id}`}
              className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-surface"
            >
              ↩ Return items
            </Link>
          )}
          <Button variant="secondary" onClick={() => run(() => downloadPdf(`/sales/${sale.id}/invoice`, `${sale.invoiceNumber}.pdf`))}>
            ⬇ Invoice PDF
          </Button>
          <Button variant="secondary" onClick={() => run(() => openPdf(`/sales/${sale.id}/receipt`))}>
            🧾 Receipt
          </Button>
        </div>
      </div>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="p-3 font-medium">Item</th>
              <th className="p-3 text-right font-medium">Qty</th>
              <th className="p-3 text-right font-medium">Price</th>
              <th className="p-3 text-right font-medium">Discount</th>
              <th className="p-3 text-right font-medium">VAT</th>
              <th className="p-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sale.lines.map((l) => (
              <tr key={l.id}>
                <td className="p-3">
                  <p className="text-ink">{l.description}</p>
                  <p className="font-mono text-xs text-muted">{l.code}</p>
                  {l.returnLines.length > 0 && (
                    <p className="text-xs text-danger">{l.returnLines.reduce((s, r) => s + r.quantity, 0)} returned</p>
                  )}
                </td>
                <td className="p-3 text-right tabular-nums">{l.quantity}</td>
                <td className="p-3 text-right tabular-nums">{money(l.unitPrice)}</td>
                <td className="p-3 text-right tabular-nums text-muted">
                  {Number(l.discountAmount) > 0 ? `${Number(l.discountPercent)}% (−${money(l.discountAmount)})` : "—"}
                </td>
                <td className="p-3 text-right tabular-nums text-muted">{Number(l.taxRate)}%</td>
                <td className="p-3 text-right font-semibold tabular-nums text-ink">{money(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sale.creditNotes.length > 0 && (
        <div className="mt-4 rounded-xl border border-line bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold text-ink">Returns</h2>
          <ul className="flex flex-col gap-1">
            {sale.creditNotes.map((c) => (
              <li key={c.id} className="flex justify-between">
                <Link href={`/returns/${c.id}`} className="font-mono text-brand">
                  {c.creditNumber}
                </Link>
                <span className="tabular-nums text-ink">−{money(c.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <dl className="rounded-xl border border-line bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold text-ink">Payment</h2>
          {sale.payments.map((p) => (
            <div key={p.id} className="flex justify-between py-0.5">
              <dt className="text-muted">
                {PAYMENT_LABELS[p.method]}
                {p.reference && ` (${p.reference})`}
              </dt>
              <dd className="tabular-nums text-ink">{money(p.amount)}</dd>
            </div>
          ))}
          {Number(sale.changeGiven) > 0 && (
            <div className="flex justify-between py-0.5">
              <dt className="text-muted">Change given</dt>
              <dd className="tabular-nums text-ink">{money(sale.changeGiven)}</dd>
            </div>
          )}
        </dl>
        <dl className="rounded-xl border border-line bg-white p-4 text-sm">
          {Number(sale.discountTotal) > 0 && (
            <div className="flex justify-between py-0.5">
              <dt className="text-muted">Discount</dt>
              <dd className="tabular-nums">−{money(sale.discountTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between py-0.5">
            <dt className="text-muted">Total excl. VAT</dt>
            <dd className="tabular-nums">{money(sale.netTotal)}</dd>
          </div>
          <div className="flex justify-between py-0.5">
            <dt className="text-muted">VAT</dt>
            <dd className="tabular-nums">{money(sale.taxTotal)}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-line pt-2 text-lg font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{money(sale.total)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
