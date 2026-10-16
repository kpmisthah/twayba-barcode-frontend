"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, Button, Field, Input, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { AuditEntry, Page, ReportOptions } from "@/lib/types";

const PAGE_SIZE = 50;

/** Turns SALE_COMPLETED into "Sale completed". */
const humanize = (action: string) => action.charAt(0) + action.slice(1).toLowerCase().replaceAll("_", " ");

/** Short, readable summary of the details stored with an entry. */
function summary(data: Record<string, unknown> | null): string {
  if (!data) return "";
  const pick = ["orderNumber", "invoiceNumber", "creditNumber", "code", "name", "item", "reason", "message", "total", "type"];
  const parts = pick.filter((k) => data[k] !== undefined && data[k] !== null && data[k] !== "").map((k) => String(data[k]));
  return parts.join(" · ");
}

export default function AuditPage() {
  const [facets, setFacets] = useState<{ actions: string[]; entities: string[] } | null>(null);
  const [users, setUsers] = useState<ReportOptions["users"]>([]);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AuditEntry> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ actions: string[]; entities: string[] }>("/audit/facets").then(setFacets).catch(() => undefined);
    api<ReportOptions>("/reports/options").then((o) => setUsers(o.users)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      api<Page<AuditEntry>>("/audit", { query: { action, entity, userId, from, to, q, page, pageSize: PAGE_SIZE } })
        .then((d) => {
          setData(d);
          setError("");
        })
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [action, entity, userId, from, to, q, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const reset = () => setPage(1);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Audit log" description="Every change and approval: who, what and when. The log can't be edited or deleted." />
      <div className="mb-4 grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-3">
        <Field label="Search">{(id) => <Input id={id} value={q} onChange={(e) => (setQ(e.target.value), reset())} placeholder="Order, invoice, code, name…" />}</Field>
        <Field label="Action">
          {(id) => (
            <Select id={id} value={action} onChange={(e) => (setAction(e.target.value), reset())}>
              <option value="">All</option>
              {facets?.actions.map((a) => (
                <option key={a} value={a}>
                  {humanize(a)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Record type">
          {(id) => (
            <Select id={id} value={entity} onChange={(e) => (setEntity(e.target.value), reset())}>
              <option value="">All</option>
              {facets?.entities.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Person">
          {(id) => (
            <Select id={id} value={userId} onChange={(e) => (setUserId(e.target.value), reset())}>
              <option value="">Everyone</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="From">{(id) => <Input id={id} type="date" value={from} onChange={(e) => (setFrom(e.target.value), reset())} />}</Field>
        <Field label="To">{(id) => <Input id={id} type="date" value={to} onChange={(e) => (setTo(e.target.value), reset())} />}</Field>
      </div>

      {error && <Alert>{error}</Alert>}
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-6 text-sm text-muted">No entries.</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">{data.total.toLocaleString()} entries</p>
          <ul className="divide-y divide-line rounded-xl border border-line bg-white">
            {data.items.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full flex-col gap-0.5 p-3 text-left hover:bg-surface sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {humanize(e.action)} <span className="font-normal text-muted">· {e.entity}</span>
                    </p>
                    <p className="truncate text-sm text-muted">{summary(e.data)}</p>
                  </div>
                  <div className="shrink-0 text-xs text-muted sm:text-right">
                    <p>{new Date(e.createdAt).toLocaleString()}</p>
                    <p>{e.user?.name ?? "System / website"}</p>
                  </div>
                </button>
                {open === e.id && (
                  <pre className="mx-3 mb-3 overflow-x-auto rounded-lg bg-surface p-3 text-xs text-ink">{JSON.stringify({ id: e.entityId, ...e.data }, null, 2)}</pre>
                )}
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Newer
              </Button>
              <span className="text-sm text-muted">
                Page {page} of {pages}
              </span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Older
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
