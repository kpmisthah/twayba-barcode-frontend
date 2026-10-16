"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Thumb } from "@/components/thumb";
import { Alert, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { LocationStock } from "@/lib/types";

/** What is stored in a location and everything inside it. */
export function LocationStockView({ locationId }: { locationId: string }) {
  const [data, setData] = useState<LocationStock | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<LocationStock>(`/stock/locations/${locationId}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [locationId]);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;

  const prefix = data.location.path;
  const total = data.items.reduce((sum, i) => sum + i.onHand, 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{prefix}</p>
      {data.items.length === 0 ? (
        <p className="rounded-lg bg-surface p-4 text-sm text-muted">Empty — no stock here.</p>
      ) : (
        <>
          <p className="text-sm text-ink">
            <span className="font-semibold">{total}</span> items in {new Set(data.items.map((i) => i.locationId)).size} place(s)
          </p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {data.items.map((i) => {
              // Show only the part below the opened location ("Shelf A › A1").
              const where = i.path === prefix ? "" : i.path.slice(prefix.length + 3);
              const name = i.variant.name === "Default" ? i.variant.product.name : `${i.variant.product.name} – ${i.variant.name}`;
              return (
                <li key={`${i.locationId}:${i.variant.id}`} className="flex items-center gap-3 p-3">
                  <Thumb src={i.variant.product.images[0]} size="size-10" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${i.variant.product.id}`} className="block truncate text-sm font-medium text-brand hover:underline">
                      {name}
                    </Link>
                    <p className="truncate text-xs text-muted">
                      <span className="font-mono">{i.variant.code}</span>
                      {where && ` · ${where}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums text-ink">{i.onHand}</p>
                    {i.reserved > 0 && <p className="text-xs text-muted">{i.reserved} reserved</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
