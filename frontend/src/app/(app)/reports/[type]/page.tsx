"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ItemPicker } from "@/components/item-picker";
import { Alert, Button, Field, Input, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { formatMoney, useSettings } from "@/lib/settings";
import type { PickedItem } from "@/lib/stock";
import type { ReportColumn, ReportInfo, ReportOptions, ReportResult } from "@/lib/types";

/** Local (shop) date as YYYY-MM-DD. */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function presets() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday
  return [
    { label: "Today", from: ymd(now), to: ymd(now) },
    { label: "This week", from: ymd(weekStart), to: ymd(now) },
    { label: "This month", from: ymd(monthStart), to: ymd(now) },
    { label: "Last month", from: ymd(lastMonthStart), to: ymd(lastMonthEnd) },
  ];
}

export default function ReportPage() {
  const { type } = useParams<{ type: string }>();
  const settings = useSettings();
  const [info, setInfo] = useState<ReportInfo | null>(null);
  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [from, setFrom] = useState(() => presets()[2].from);
  const [to, setTo] = useState(() => presets()[2].to);
  const [product, setProduct] = useState<PickedItem | null>(null);
  const [locationId, setLocationId] = useState("");
  const [userId, setUserId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ReportInfo[]>("/reports")
      .then((all) => setInfo(all.find((r) => r.type === type) ?? null))
      .catch((e) => setError(e.message));
    api<ReportOptions>("/reports/options").then(setOptions).catch(() => undefined);
  }, [type]);

  const has = (k: ReportInfo["filters"][number]) => !!info?.filters.includes(k);
  const query = useCallback(
    (): Record<string, string | undefined> => ({
      from: has("date") ? from || undefined : undefined,
      to: has("date") ? to || undefined : undefined,
      productId: has("product") ? product?.productId : undefined,
      locationId: has("location") ? locationId || undefined : undefined,
      userId: has("user") ? userId || undefined : undefined,
      categoryId: has("category") ? categoryId || undefined : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `has` reads `info`, listed
    [info, from, to, product, locationId, userId, categoryId],
  );

  const run = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(await api<ReportResult>(`/reports/${type}`, { query: query() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not run the report");
    } finally {
      setLoading(false);
    }
  }, [type, query]);

  // First run as soon as we know which filters this report takes.
  const infoLoaded = !!info;
  useEffect(() => {
    if (!infoLoaded) return;
    api<ReportResult>(`/reports/${type}`, { query: query() })
      .then(setResult)
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only once, not on every filter change
  }, [infoLoaded]);

  if (!info) return error ? <Alert>{error}</Alert> : <Spinner />;

  const format = (c: ReportColumn, v: string | number | null | undefined) => {
    if (v === null || v === undefined || v === "") return "";
    if (c.type === "money") return formatMoney(String(v), settings?.currency);
    if (c.type === "datetime") return new Date(String(v)).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    if (c.type === "date") return new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString();
    if (c.type === "number") return Number(v).toLocaleString();
    return String(v);
  };
  const numeric = (c: ReportColumn) => c.type === "money" || c.type === "number";

  return (
    <div className="pb-10">
      <Link href="/reports" className="mb-4 inline-block text-sm text-brand">
        ← Reports
      </Link>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-ink">{info.title}</h1>
        <p className="text-sm text-muted">{info.description}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-white p-4"
      >
        {has("date") && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {presets().map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => (setFrom(p.from), setTo(p.to))}
                  className={`min-h-9 rounded-full border px-3 text-sm ${from === p.from && to === p.to ? "border-brand bg-brand/10 font-semibold text-brand" : "border-line text-ink"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="From">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
              <Field label="To">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
            </div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          {has("location") && (
            <Field label="Location">
              {(id) => (
                <Select id={id} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  <option value="">All</option>
                  {options?.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.path}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {has("user") && (
            <Field label={info.userLabel ?? "Person"}>
              {(id) => (
                <Select id={id} value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">Everyone</option>
                  {options?.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {!u.active && " (inactive)"}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {has("category") && (
            <Field label="Category">
              {(id) => (
                <Select id={id} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">All</option>
                  {options?.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>
        {has("product") && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Product</p>
            {product ? (
              <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="flex-1 text-ink">{product.productName}</span>
                <button type="button" className="text-brand" onClick={() => setProduct(null)}>
                  All products
                </button>
              </div>
            ) : (
              <ItemPicker value={null} onChange={setProduct} />
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Working…" : "Show report"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => downloadFile(`/reports/${type}/xlsx`, `${type}-${ymd(new Date())}.xlsx`, query()).catch((e) => setError(e.message))}
          >
            ⬇ Excel
          </Button>
        </div>
      </form>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {!result && !error && <Spinner />}
      {result && (
        <>
          <p className="mb-2 text-sm text-muted">
            {result.rows.length.toLocaleString()} row{result.rows.length === 1 ? "" : "s"}
            {result.truncated && " — only the first rows are shown; narrow the filters"}
          </p>
          {result.rows.length === 0 ? (
            <p className="rounded-xl border border-line bg-white p-6 text-sm text-muted">Nothing for these filters.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-white">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c.key} className={`whitespace-nowrap px-3 py-2 text-xs font-semibold text-muted ${numeric(c) ? "text-right" : "text-left"}`}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {result.rows.slice(0, 1000).map((row, i) => (
                    <tr key={i} className="hover:bg-surface/60">
                      {result.columns.map((c) => (
                        <td key={c.key} className={`px-3 py-2 ${numeric(c) ? "whitespace-nowrap text-right tabular-nums" : ""} ${c.type === "datetime" ? "whitespace-nowrap" : ""}`}>
                          {format(c, row[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {result.totals && (
                  <tfoot className="border-t-2 border-line bg-surface font-semibold">
                    <tr>
                      {result.columns.map((c, i) => (
                        <td key={c.key} className={`px-3 py-2 ${numeric(c) ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                          {i === 0 ? "Total" : c.key in result.totals! ? format(c, result.totals![c.key]) : ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
              {result.rows.length > 1000 && <p className="p-3 text-sm text-muted">Showing 1,000 rows here — download Excel for all {result.rows.length.toLocaleString()}.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
