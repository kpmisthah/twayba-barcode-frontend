"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Thumb } from "@/components/thumb";
import { Alert, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { LowStockRow } from "@/lib/types";

export default function LowStockPage() {
  const { user } = useAuth();
  const canAdd = can(user?.role, "stockWrite");
  const [rows, setRows] = useState<LowStockRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<LowStockRow[]>("/stock/low").then(setRows).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Low stock" description="Items with fewer available than the product's minimum stock (set on each product). Kits count complete kits." />
      {error && <Alert>{error}</Alert>}
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-6 text-sm text-muted">Nothing is below its minimum. 👍</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {rows.map((r) => (
            <li key={r.variantId} className="flex items-center gap-3 p-4">
              <Thumb src={r.image} size="size-10" />
              <div className="min-w-0 flex-1">
                <Link href={`/products/${r.productId}`} className="block truncate font-medium text-brand hover:underline">
                  {r.name}
                </Link>
                <p className="font-mono text-xs text-muted">{r.code}</p>
              </div>
              <div className="text-right">
                <p className={`font-semibold tabular-nums ${r.available === 0 ? "text-danger" : "text-ink"}`}>
                  {r.available} <span className="font-normal text-muted">/ min {r.minStock}</span>
                </p>
                {canAdd && (
                  <Link href={`/stock?tab=add&product=${r.productId}&variant=${r.variantId}`} className="text-sm text-brand">
                    + Add stock
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
