"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { MOVEMENT_LABELS, type Movement, type MovementType, type Page, type ProductStock, type StockItem } from "@/lib/types";

// ------------------------------------------------------------ product stock

/** Totals and per-location breakdown for every variant / box of a product. */
export function ProductStockPanel({ productId }: { productId: string }) {
  const [stock, setStock] = useState<ProductStock | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ProductStock>(`/stock/products/${productId}`)
      .then(setStock)
      .catch((e) => setError(e.message));
  }, [productId]);

  if (error) return <Alert>{error}</Alert>;
  if (!stock) return <Spinner />;

  const nameOf = (variantId: string) => stock.items.find((i) => i.variantId === variantId)?.name.split(" – ")[0] ?? "?";
  const spare = stock.kit?.boxes.filter((b) => b.spare > 0) ?? [];

  return (
    <section className="rounded-xl border border-line bg-white">
      <div className="border-b border-line p-5">
        <h2 className="font-semibold text-ink">Stock</h2>
        {stock.kit && (
          <div className="mt-3 flex flex-col gap-1">
            <p className="text-sm text-ink">
              <span className="text-2xl font-semibold">{stock.kit.sellable}</span> complete kits available
              {stock.kit.low && (
                <span className="ml-2">
                  <Badge tone="brand">Low stock</Badge>
                </span>
              )}
            </p>
            {spare.length > 0 && (
              <p className="text-sm text-muted">
                Incomplete: {spare.map((b) => `${b.spare} × ${nameOf(b.variantId)}`).join(", ")} spare
              </p>
            )}
          </div>
        )}
      </div>
      <ul className="divide-y divide-line">
        {stock.items.map((item) => (
          <StockItemRow key={item.variantId} item={item} showName={stock.items.length > 1 || !!stock.kit} />
        ))}
      </ul>
    </section>
  );
}

function StockItemRow({ item, showName }: { item: StockItem; showName: boolean }) {
  const t = item.totals;
  return (
    <li className="p-5">
      {showName && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{item.name}</span>
          <span className="font-mono text-xs text-muted">{item.code}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <Stat label="Available" value={t.available} strong />
        <Stat label="In store" value={t.onHand} />
        {t.reserved > 0 && <Stat label="Reserved" value={t.reserved} />}
        {t.inTransit > 0 && <Stat label="In transit" value={t.inTransit} />}
        {t.damaged > 0 && <Stat label="Damaged" value={t.damaged} />}
        {item.low && <Badge tone="brand">Low stock</Badge>}
      </div>
      {item.locations.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No stock recorded yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-3 font-medium">Location</th>
                <th className="py-1 pr-3 text-right font-medium">On hand</th>
                <th className="py-1 text-right font-medium">Reserved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {item.locations.map((l) => (
                <tr key={l.locationId}>
                  <td className="py-2 pr-3 text-ink">{l.path}</td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums text-ink">{l.onHand}</td>
                  <td className="py-2 text-right tabular-nums text-muted">{l.reserved || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <span className="text-muted">
      {label} <span className={`tabular-nums ${strong ? "text-lg font-semibold text-ink" : "font-medium text-ink"}`}>{value}</span>
    </span>
  );
}

// ------------------------------------------------------------ history

const PAGE_SIZE = 30;

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Movement ledger, newest first, with "Load more". */
export function MovementList({
  filter,
  showProduct = true,
}: {
  filter: { productId?: string; locationId?: string; type?: MovementType };
  showProduct?: boolean;
}) {
  const [items, setItems] = useState<Movement[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { productId, locationId, type } = filter;

  const fetchPage = useCallback(
    (n: number) => api<Page<Movement>>("/stock/movements", { query: { productId, locationId, type, page: n, pageSize: PAGE_SIZE } }),
    [productId, locationId, type],
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage(1)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setPage(1);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  async function loadMore() {
    setLoading(true);
    try {
      const res = await fetchPage(page + 1);
      setItems((prev) => [...(prev ?? []), ...res.items]);
      setTotal(res.total);
      setPage(page + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load more");
    } finally {
      setLoading(false);
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!items) return <Spinner />;
  if (items.length === 0)
    return <p className="rounded-2xl border border-dashed border-line bg-white/60 p-10 text-center text-sm text-muted">No stock movements yet.</p>;

  return (
    <div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white shadow-sm">
        {items.map((m) => (
          <li key={m.id} className="flex flex-col gap-1 p-4 transition-colors hover:bg-surface/60 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONES[m.type]}>{MOVEMENT_LABELS[m.type]}</Badge>
                <span className="font-semibold tabular-nums text-ink">{m.quantity} ×</span>
                {showProduct ? (
                  <Link href={`/products/${m.variant.product.id}`} className="truncate font-medium text-brand hover:underline">
                    {itemName(m)}
                  </Link>
                ) : (
                  <span className="truncate font-medium text-ink">{m.variant.name === "Default" ? m.variant.code : m.variant.name}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">
                {m.from && <span className="text-ink">{m.from.path}</span>}
                {m.from && m.to && " → "}
                {m.to && <span className="text-ink">{m.to.path}</span>}
              </p>
              {(m.reason || m.note || m.reference) && (
                <p className="mt-1 text-sm text-muted">{[m.reason, m.reference, m.note].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <div className="shrink-0 text-xs text-muted sm:text-right">
              <p>{dateTime.format(new Date(m.createdAt))}</p>
              <p>{m.user?.name ?? "System"}</p>
            </div>
          </li>
        ))}
      </ul>
      {items.length < total && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : `Show more (${total - items.length} older)`}
          </Button>
        </div>
      )}
    </div>
  );
}

const TONES: Record<MovementType, "neutral" | "ok" | "muted" | "brand" | "warn" | "danger"> = {
  STOCK_IN: "ok",
  RETURN: "ok",
  SALE_RETURN: "ok",
  STOCK_OUT: "warn",
  SALE: "brand",
  DELIVER: "brand",
  DAMAGE: "danger",
  TRANSFER: "neutral",
  LOAD: "neutral",
  ADJUSTMENT: "neutral",
  RESERVE: "muted",
  RELEASE: "muted",
  TRANSFER_OUT: "neutral",
  TRANSFER_IN: "neutral",
};

function itemName(m: Movement) {
  return m.variant.name === "Default" ? m.variant.product.name : `${m.variant.product.name} – ${m.variant.name}`;
}
