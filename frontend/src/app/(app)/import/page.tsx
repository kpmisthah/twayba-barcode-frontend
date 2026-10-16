"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { downloadFile } from "@/lib/download";
import { can } from "@/lib/permissions";

interface ImportResult {
  rows: { row: number; ok: boolean; summary: string; errors: string[] }[];
  okCount: number;
  errorCount: number;
  committed: boolean;
  created?: number;
}

export default function ImportPage() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Import from Excel" description="Load many products or your current stock at once. Download the template, fill it in, then check and import." />
      <div className="flex flex-col gap-6">
        {can(user?.role, "catalogWrite") && (
          <ImportBox
            title="Products"
            kind="products"
            hint="One row per item. Rows with the same product name become one product with several colours/sizes. Multi-box kits are added in the app."
            template="products-template.xlsx"
          />
        )}
        {can(user?.role, "stockAdjust") && (
          <ImportBox
            title="Opening stock"
            kind="stock"
            hint="One row per item per place: SKU or barcode, location (label code like LOC-000012, or full path) and quantity. Import products and create locations first."
            template="opening-stock-template.xlsx"
          />
        )}
      </div>
    </div>
  );
}

function ImportBox({ title, kind, hint, template }: { title: string; kind: "products" | "stock"; hint: string; template: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(commit: boolean) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      setResult(await api<ImportResult>(`/imports/${kind}`, { method: "POST", body: form, query: { commit: commit ? "true" : undefined } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div>
        <h2 className="font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-muted">{hint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => downloadFile(`/imports/${kind}/template`, template).catch((e) => setError(e.message))}>
          ⬇ Template
        </Button>
        <label className="flex min-h-11 cursor-pointer items-center rounded-lg border border-dashed border-line px-4 text-sm text-ink hover:bg-surface">
          {file ? file.name : "Choose Excel or CSV file…"}
          <input
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError("");
            }}
          />
        </label>
        <Button onClick={() => send(false)} disabled={!file || busy}>
          {busy && !result ? "Checking…" : "Check file"}
        </Button>
      </div>

      {error && <Alert>{error}</Alert>}

      {result && (
        <>
          {result.committed ? (
            <Alert kind={result.errorCount ? "error" : "success"}>
              {result.errorCount ? `Imported ${result.created ?? 0}; ${result.errorCount} row(s) could not be imported — see below.` : `✓ Imported — ${result.created} ${kind === "products" ? "product(s)" : "stock line(s)"} added.`}
            </Alert>
          ) : result.errorCount ? (
            <Alert>
              {result.errorCount} row(s) have problems. Fix them in the file and check again — nothing is imported until every row is OK.
            </Alert>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border border-ok/30 bg-ok/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ok">All {result.okCount} rows are OK.</p>
              <Button onClick={() => send(true)} disabled={busy}>
                {busy ? "Importing…" : `Import ${result.okCount} rows`}
              </Button>
            </div>
          )}
          <div className="max-h-96 overflow-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.rows.map((r) => (
                  <tr key={r.row} className={r.ok ? "" : "bg-danger/5"}>
                    <td className="px-3 py-2 tabular-nums text-muted">{r.row}</td>
                    <td className="px-3 py-2">
                      {r.ok ? <span className="text-ink">✓ {r.summary}</span> : <span className="text-danger">{r.errors.join(" · ")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
