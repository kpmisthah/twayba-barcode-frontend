"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, Badge, Button, Field, Input, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { canUseSite } from "@/lib/stock";
import type { Location, Stocktake, StocktakeListItem } from "@/lib/types";
import { STATUS_LABELS } from "./status";

export default function StocktakesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const canCount = can(user?.role, "stockWrite");
  const [items, setItems] = useState<StocktakeListItem[] | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<StocktakeListItem[]>("/stocktakes").then(setItems).catch((e) => setError(e.message));
    api<Location[]>("/locations").then((all) => setLocations(all.filter((l) => l.type !== "TRANSIT" && l.type !== "DAMAGED" && canUseSite(user, l.siteId))));
  }, [user]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const st = await api<Stocktake>("/stocktakes", { method: "POST", body: { locationId, note: note || undefined } });
      router.push(`/stocktakes/${st.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Stocktake" description="Count what's really on the shelves. Differences are corrected only after an admin or manager approves." />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {canCount && (
        <form onSubmit={start} className="mb-6 grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Count this location (and everything inside it)">
            {(id) => (
              <Select id={id} value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
                <option value="">Choose…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.path}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Note (optional)">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. monthly count" />}</Field>
          <Button type="submit" disabled={busy || !locationId}>
            {busy ? "Starting…" : "Start counting"}
          </Button>
        </form>
      )}

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-6 text-sm text-muted">No stocktakes yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {items.map((s) => (
            <li key={s.id}>
              <Link href={`/stocktakes/${s.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-surface">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-mono font-semibold text-ink">{s.code}</span> <span className="text-ink">{s.locationPath}</span>
                  </p>
                  <p className="text-sm text-muted">
                    {new Date(s.createdAt).toLocaleDateString()} · {s.createdBy.name} · {s._count.lines} lines
                  </p>
                </div>
                <Badge tone={STATUS_LABELS[s.status].tone}>{STATUS_LABELS[s.status].label}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
