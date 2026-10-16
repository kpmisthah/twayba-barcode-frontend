"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { downloadPdf } from "@/lib/download";
import { formatMoney } from "@/lib/settings";
import { PAYMENT_LABELS, type CreditNote } from "@/lib/types";

export default function CreditNotePage() {
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState<CreditNote | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<CreditNote>(`/returns/${id}`).then(setNote).catch((e) => setError(e.message));
  }, [id]);

  if (error && !note) return <Alert>{error}</Alert>;
  if (!note) return <Spinner />;
  const money = (v: string) => formatMoney(v, note.sale.currency);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/returns" className="mb-4 inline-block text-sm text-brand">
        ← Returns
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold text-ink">{note.creditNumber}</h1>
          <p className="mt-1 text-sm text-muted">
            {new Date(note.createdAt).toLocaleString()} · by {note.cashier.name} · for{" "}
            <Link href={`/sales/${note.sale.id}`} className="font-mono text-brand">
              {note.sale.invoiceNumber}
            </Link>
          </p>
          {note.reason && <p className="mt-1 text-sm text-ink">Reason: {note.reason}</p>}
        </div>
        <Button variant="secondary" onClick={() => downloadPdf(`/returns/${note.id}/pdf`, `${note.creditNumber}.pdf`).catch((e) => setError(e.message))}>
          ⬇ Credit note PDF
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      <ul className="divide-y divide-line rounded-xl border border-line bg-white">
        {note.lines.map((l) => (
          <li key={l.id} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-ink">
                {l.quantity} × {l.saleLine.description}
              </p>
              <p className="text-sm text-muted">
                <Badge tone={l.condition === "GOOD" ? "ok" : "brand"}>{l.condition === "GOOD" ? "Good" : "Damaged"}</Badge> → {l.locationPath}
              </p>
            </div>
            <span className="shrink-0 font-semibold tabular-nums text-ink">{money(l.total)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-xl border border-line bg-white p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Excl. VAT</span>
          <span className="tabular-nums">{money(note.netTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">VAT</span>
          <span className="tabular-nums">{money(note.taxTotal)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-line pt-2 text-lg font-semibold">
          <span>Refunded ({PAYMENT_LABELS[note.refundMethod]})</span>
          <span className="tabular-nums">{money(note.total)}</span>
        </div>
      </div>
    </div>
  );
}
