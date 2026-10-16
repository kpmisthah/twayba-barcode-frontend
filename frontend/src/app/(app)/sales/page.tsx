"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, Button, Input, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { formatMoney, useSettings } from "@/lib/settings";
import type { Page, SaleListItem } from "@/lib/types";

const PAGE_SIZE = 25;
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function SalesPage() {
  const settings = useSettings();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<SaleListItem> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      api<Page<SaleListItem>>("/sales", { query: { q, from, to, page, pageSize: PAGE_SIZE } })
        .then((res) => {
          setData(res);
          setError("");
        })
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, from, to, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Sales" description="Every invoice. Invoices can't be changed — returns will create credit notes." />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Input
          placeholder="Invoice number, customer name or phone"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          aria-label="Search sales"
        />
        <Input type="date" value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} aria-label="To date" />
      </div>
      {error && <Alert>{error}</Alert>}
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-6 text-sm text-muted">No sales found.</p>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-xl border border-line bg-white">
            {data.items.map((s) => (
              <li key={s.id}>
                <Link href={`/sales/${s.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-surface">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-ink">{s.invoiceNumber}</p>
                    <p className="truncate text-sm text-muted">
                      {dateTime.format(new Date(s.createdAt))} · {s.cashier.name}
                      {s.customerName && ` · ${s.customerName}`} · {s._count.lines} line{s._count.lines === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">{formatMoney(s.total, settings?.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted">
                Page {page} of {pages}
              </span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
