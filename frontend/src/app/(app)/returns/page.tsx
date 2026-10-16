"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, Input, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatMoney, useSettings } from "@/lib/settings";
import type { CreditNoteListItem, Page } from "@/lib/types";

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function ReturnsPage() {
  const { user } = useAuth();
  const settings = useSettings();
  const [q, setQ] = useState("");
  const [data, setData] = useState<Page<CreditNoteListItem> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      api<Page<CreditNoteListItem>>("/returns", { query: { q, pageSize: 50 } })
        .then(setData)
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Returns"
        description="Each return makes a credit note against the original invoice."
        action={
          can(user?.role, "pos") && (
            <Link href="/returns/new" className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">
              + New return
            </Link>
          )
        }
      />
      <Input className="mb-4" placeholder="Credit note, invoice number or customer" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search returns" />
      {error && <Alert>{error}</Alert>}
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-6 text-sm text-muted">No returns yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {data.items.map((c) => (
            <li key={c.id}>
              <Link href={`/returns/${c.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-surface">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold text-ink">
                    {c.creditNumber} <span className="font-sans font-normal text-muted">for {c.sale.invoiceNumber}</span>
                  </p>
                  <p className="truncate text-sm text-muted">
                    {dateTime.format(new Date(c.createdAt))} · {c.cashier.name}
                    {c.sale.customerName && ` · ${c.sale.customerName}`}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-ink">−{formatMoney(c.total, settings?.currency)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
