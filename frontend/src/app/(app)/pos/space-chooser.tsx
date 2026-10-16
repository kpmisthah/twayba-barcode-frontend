"use client";

import { useEffect, useState } from "react";
import { Alert, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { Location, ProductStock } from "@/lib/types";
import { inCart, type CartLine, type Pick } from "./cart";

/**
 * "Taken from which space?" — asked after every scan. Only spaces in this shop's site are offered;
 * spaces with nothing left (counting what's already in the cart) are greyed out.
 */
export function SpaceChooser({
  productId,
  variantId,
  site,
  cart,
  onPick,
}: {
  productId: string;
  variantId: string;
  site: Location;
  cart: CartLine[];
  onPick: (pick: Pick) => void;
}) {
  const [stock, setStock] = useState<ProductStock | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ProductStock>(`/stock/products/${productId}`)
      .then(setStock)
      .catch((e) => setError(e.message));
  }, [productId]);

  if (error) return <Alert>{error}</Alert>;
  if (!stock) return <Spinner />;

  const locations = stock.items.find((i) => i.variantId === variantId)?.locations ?? [];
  const here = locations
    .filter((l) => l.site === site.name && l.type !== "TRANSIT" && l.type !== "DAMAGED")
    .map((l) => ({ ...l, left: l.available - inCart(cart, variantId, l.locationId), where: l.path.split(" › ").slice(1).join(" › ") || l.path }));
  const elsewhere = new Map<string, number>();
  for (const l of locations) {
    if (l.site !== site.name && l.type !== "TRANSIT" && l.type !== "DAMAGED" && l.available > 0) {
      elsewhere.set(l.site, (elsewhere.get(l.site) ?? 0) + l.available);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {here.length === 0 ? (
        <p className="rounded-lg bg-surface p-4 text-sm text-ink">None in stock at {site.name}.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {here.map((l) => (
            <li key={l.locationId}>
              <button
                type="button"
                disabled={l.left <= 0}
                onClick={() => onPick({ locationId: l.locationId, where: l.where, quantity: 1 })}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-line px-4 text-left hover:border-brand hover:bg-brand/5 disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted disabled:hover:border-line"
              >
                <span className="font-medium">{l.where}</span>
                <span className="shrink-0 text-sm tabular-nums">{l.left > 0 ? `${l.left} left` : "none left"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {elsewhere.size > 0 && (
        <p className="text-sm text-muted">
          Also in stock at: {[...elsewhere.entries()].map(([s, n]) => `${s} (${n})`).join(", ")}. Move it to {site.name} first to sell it here.
        </p>
      )}
    </div>
  );
}
