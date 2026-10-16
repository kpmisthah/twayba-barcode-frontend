"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ItemPicker } from "@/components/item-picker";
import { LocationPicker } from "@/components/location-picker";
import { PageHeader } from "@/components/page-header";
import { Alert, Badge, Button, Field, Input, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { canUseSite, itemLabel, stockableLocations, type PickedItem } from "@/lib/stock";
import type { Location, Transfer, TransferListItem } from "@/lib/types";
import { TRANSFER_STATUS } from "./status";

export default function TransfersPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<TransferListItem[] | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api<TransferListItem[]>("/transfers").then(setItems).catch((e) => setError(e.message));
  }, []);

  const onTheWay = (items ?? []).filter((t) => t.status === "IN_TRANSIT");
  const toMe = onTheWay.filter((t) => t.to && canUseSite(user, t.to.siteId));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Transfers"
        description="Send stock to another place in two steps: scan it out here, then it is scanned in when it arrives. Until then it shows as “on the way”."
        action={can(user?.role, "stockWrite") && !sending && <Button onClick={() => setSending(true)}>+ Send stock</Button>}
      />
      {error && <Alert>{error}</Alert>}
      {sending && <SendForm onCancel={() => setSending(false)} />}

      {!items ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-6">
          {toMe.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold text-ink">To receive ({toMe.length})</h2>
              <List items={toMe} />
            </section>
          )}
          <section>
            <h2 className="mb-2 font-semibold text-ink">All transfers</h2>
            {items.length ? <List items={items} /> : <p className="rounded-xl border border-line bg-white p-6 text-sm text-muted">No transfers yet.</p>}
          </section>
        </div>
      )}
    </div>
  );
}

function List({ items }: { items: TransferListItem[] }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-white">
      {items.map((t) => (
        <li key={t.id}>
          <Link href={`/transfers/${t.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-surface">
            <div className="min-w-0">
              <p className="text-sm">
                <span className="font-mono font-semibold text-ink">{t.code}</span> <span className="text-muted">· {t.units} item(s)</span>
              </p>
              <p className="truncate text-sm text-ink">
                {t.from?.path} → {t.to?.path}
              </p>
              <p className="text-xs text-muted">
                Sent {new Date(t.sentAt).toLocaleString()} by {t.sentBy.name}
                {t.received > 0 && t.status === "IN_TRANSIT" && ` · ${t.received} received so far`}
                {t.lost > 0 && ` · ${t.lost} lost`}
              </p>
            </div>
            <Badge tone={TRANSFER_STATUS[t.status].tone}>{TRANSFER_STATUS[t.status].label}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Choose where from and where to, add items (scan or search), then send. */
function SendForm({ onCancel }: { onCancel: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [lines, setLines] = useState<{ item: PickedItem; quantity: number }[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Location[]>("/locations").then(setLocations).catch((e) => setError(e.message));
  }, []);
  const from = useMemo(() => stockableLocations(locations, user).map((location) => ({ location })), [locations, user]);
  const to = useMemo(() => stockableLocations(locations).filter((l) => l.id !== fromId).map((location) => ({ location })), [locations, fromId]);

  function add(item: PickedItem | null) {
    if (!item) return;
    setLines((ls) => {
      const existing = ls.find((l) => l.item.variantId === item.variantId);
      return existing ? ls.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { item, quantity: 1 }];
    });
  }

  async function send() {
    setSaving(true);
    setError("");
    try {
      const t = await api<Transfer>("/transfers", {
        method: "POST",
        body: { fromLocationId: fromId, toLocationId: toId, note: note || undefined, lines: lines.map((l) => ({ variantId: l.item.variantId, quantity: l.quantity })) },
      });
      router.push(`/transfers/${t.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send");
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 flex flex-col gap-4 rounded-xl border border-brand/30 bg-white p-5">
      <h2 className="font-semibold text-ink">Send stock</h2>
      {error && <Alert>{error}</Alert>}
      <LocationPicker label="From (where it is now)" options={from} value={fromId} onChange={setFromId} />
      <LocationPicker label="To (where it is going)" options={to} value={toId} onChange={setToId} />
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Items — scan each one (each scan adds 1) or search</p>
        <ItemPicker value={null} onChange={add} />
      </div>
      {lines.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {lines.map((l, i) => (
            <li key={l.item.variantId} className="flex items-center gap-3 p-3">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{itemLabel(l.item)}</span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={l.quantity}
                onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))}
                className="h-10 min-h-10! w-20!"
                aria-label={`Quantity of ${itemLabel(l.item)}`}
              />
              <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-sm text-danger">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <Field label="Note (optional)">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. van 2, for the shop display" />}</Field>
      <div className="flex gap-2">
        <Button onClick={send} disabled={saving || !fromId || !toId || !lines.length}>
          {saving ? "Sending…" : "Send — items leave stock here"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
