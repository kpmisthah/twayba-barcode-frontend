"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, Badge, Button, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

interface Issue {
  id: string;
  externalId: string | null;
  payload: { customerName?: string; items?: { sku?: string; quantity?: number }[] } | null;
  error: string;
  status: "OPEN" | "RESOLVED" | "IGNORED";
  attempts: number;
  firstSeenAt: string;
  lastTriedAt: string;
  orderId: string | null;
}

/** Website orders that could not be imported. Fix the cause (e.g. add the SKU), then Retry. */
export default function WebsiteProblemsPage() {
  const [showAll, setShowAll] = useState(false);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () => api<Issue[]>("/website-orders/issues", { query: { status: showAll ? undefined : "OPEN" } }).then(setIssues),
    [showAll],
  );
  useEffect(() => {
    load().catch((e) => setMessage({ kind: "error", text: e.message }));
  }, [load]);

  async function act(issue: Issue, action: "retry" | "ignore") {
    setBusy(issue.id);
    setMessage(null);
    try {
      const r = await api<{ ok: boolean; orderNumber?: string; error?: string }>(`/website-orders/issues/${issue.id}/${action}`, { method: "POST", body: {} });
      setMessage(
        action === "ignore"
          ? { kind: "success", text: "Marked as ignored." }
          : r.ok
            ? { kind: "success", text: `Imported as ${r.orderNumber}.` }
            : { kind: "error", text: `Still failing: ${r.error}` },
      );
      await load();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/orders" className="mb-4 inline-block text-sm text-brand">
        ← Orders
      </Link>
      <PageHeader
        title="Website order problems"
        description="Orders the website sent that could not be imported. Nothing is lost: fix the cause (usually a product SKU that doesn't match), then press Retry."
      />
      <label className="mb-3 flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Also show solved and ignored
      </label>
      {message && (
        <div className="mb-4">
          <Alert kind={message.kind}>{message.text}</Alert>
        </div>
      )}
      {!issues ? (
        <Spinner />
      ) : issues.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-6 text-sm text-muted">No problems — every website order came through. 👍</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {issues.map((i) => (
            <li key={i.id} className="rounded-xl border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    Website order {i.externalId ? `#${i.externalId}` : "(no order id)"}
                    {i.payload?.customerName && <span className="font-normal text-muted"> · {i.payload.customerName}</span>}
                  </p>
                  <p className="mt-1 text-sm text-danger">{i.error}</p>
                  {i.payload?.items?.length ? (
                    <p className="mt-1 text-xs text-muted">Items: {i.payload.items.map((it) => `${it.quantity ?? "?"} × ${it.sku ?? "?"}`).join(", ")}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted">
                    {i.attempts} attempt{i.attempts === 1 ? "" : "s"} · last {new Date(i.lastTriedAt).toLocaleString()}
                  </p>
                </div>
                {i.status === "OPEN" ? (
                  <Badge tone="brand">Needs attention</Badge>
                ) : i.status === "RESOLVED" ? (
                  <Badge tone="ok">Imported</Badge>
                ) : (
                  <Badge tone="muted">Ignored</Badge>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {i.status === "OPEN" && (
                  <>
                    <Button onClick={() => act(i, "retry")} disabled={busy === i.id}>
                      {busy === i.id ? "Trying…" : "Retry"}
                    </Button>
                    <Button variant="ghost" onClick={() => act(i, "ignore")} disabled={busy === i.id}>
                      Ignore
                    </Button>
                  </>
                )}
                {i.orderId && (
                  <Link href={`/orders/${i.orderId}`} className="inline-flex min-h-11 items-center px-2 text-sm text-brand">
                    Open order →
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
