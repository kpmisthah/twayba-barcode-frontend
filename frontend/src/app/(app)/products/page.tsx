"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Thumb } from "@/components/thumb";
import { Alert, Badge, Button, Input, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatMoney, useSettings } from "@/lib/settings";
import type { Category, Page, ProductListItem } from "@/lib/types";

const PAGE_SIZE = 25;

export default function ProductsPage() {
  const { user } = useAuth();
  const settings = useSettings();
  const [data, setData] = useState<Page<ProductListItem> | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setData(
        await api<Page<ProductListItem>>("/products", {
          query: { q, categoryId, status, type, page, pageSize: PAGE_SIZE },
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load products");
    }
  }, [q, categoryId, status, type, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    api<Category[]>("/categories").then(setCategories).catch(() => setCategories([]));
  }, []);

  const filter = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Products"
        description={data ? `${data.total} product${data.total === 1 ? "" : "s"}` : undefined}
        action={
          can(user?.role, "catalogWrite") && (
            <Link href="/products/new">
              <Button className="w-full sm:w-auto">Add product</Button>
            </Link>
          )
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_150px_150px]">
        <Input placeholder="Search name, SKU, code or barcode" value={q} onChange={(e) => filter(setQ)(e.target.value)} aria-label="Search products" />
        <Select value={categoryId} onChange={(e) => filter(setCategoryId)(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => filter(setType)(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          <option value="STANDARD">Single item</option>
          <option value="KIT">Multi-box kit</option>
        </Select>
        <Select value={status} onChange={(e) => filter(setStatus)(e.target.value)} aria-label="Status">
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="">All</option>
        </Select>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-8 text-center text-sm text-muted">No products found.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {data.items.map((p) => (
            <li key={p.id}>
              <Link href={`/products/${p.id}`} className="flex items-center gap-4 p-3 hover:bg-surface sm:p-4">
                <Thumb src={p.images[0]} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{p.name}</span>
                    {p.type === "KIT" && <Badge tone="brand">{boxCount(p)} boxes</Badge>}
                    {p.status === "INACTIVE" && <Badge tone="muted">Inactive</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {[p.category?.name, p.brand, variantSummary(p)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-ink">{priceRange(p, settings?.currency)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data && pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
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
  );
}

function boxCount(p: ProductListItem) {
  return p.variants.filter((v) => v.kind === "COMPONENT").length;
}

function variantSummary(p: ProductListItem) {
  if (p.type === "KIT") return p.variants.find((v) => v.kind === "KIT")?.code;
  const active = p.variants.filter((v) => v.active);
  return active.length === 1 ? active[0].sku : `${active.length} variants`;
}

function priceRange(p: ProductListItem, currency?: string) {
  const prices = p.variants
    .filter((v) => v.active && v.kind !== "COMPONENT" && v.price !== null)
    .map((v) => Number(v.price));
  if (!prices.length) return "—";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatMoney(min, currency) : `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`;
}
