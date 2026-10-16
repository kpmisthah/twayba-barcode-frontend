"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CameraScanner } from "@/components/camera-scanner";
import { Thumb } from "@/components/thumb";
import { Alert, Badge, Button, Field, Input, Modal, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { scanError, scanSuccess } from "@/lib/feedback";
import { can } from "@/lib/permissions";
import { canUseSite, lookupCode } from "@/lib/stock";
import type { Transfer } from "@/lib/types";
import { TRANSFER_STATUS } from "../status";

type Line = Transfer["lines"][number];
const itemName = (l: Line) =>
  l.variant.kind === "COMPONENT" ? `${l.variant.product.name}, ${l.variant.name.split(" – ")[0]}` : l.variant.name === "Default" ? l.variant.product.name : `${l.variant.product.name} – ${l.variant.name}`;

/** Receive at the destination: scan what arrived (or type the numbers), then confirm. */
export default function TransferPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [t, setT] = useState<Transfer | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [dialog, setDialog] = useState<"close" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Transfer>(`/transfers/${id}`).then(setT).catch((e) => setMessage({ kind: "error", text: e.message }));
  }, [id]);

  if (!t) return message ? <Alert>{message.text}</Alert> : <Spinner />;

  const open = t.status === "IN_TRANSIT";
  const canReceive = open && can(user?.role, "stockWrite") && !!t.to && canUseSite(user, t.to.siteId);
  const left = (l: Line) => l.quantity - l.received - l.lost;
  const toReceive = Object.values(counts).reduce((s, n) => s + n, 0);

  async function scan(raw: string) {
    const value = raw.trim();
    if (!value || !t) return;
    try {
      const item = await lookupCode(value);
      const line = t.lines.find((l) => l.variantId === item.variantId);
      if (!line) throw new Error(`${item.productName} is not part of this transfer`);
      if ((counts[line.variantId] ?? 0) >= left(line)) throw new Error(`All ${left(line)} × ${itemName(line)} already counted`);
      setCounts({ ...counts, [line.variantId]: (counts[line.variantId] ?? 0) + 1 });
      scanSuccess();
      setMessage(null);
    } catch (e) {
      scanError();
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Unknown code" });
    }
  }

  async function post(path: string, body: unknown, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      setT(await api<Transfer>(`/transfers/${id}/${path}`, { method: "POST", body }));
      setCounts({});
      setDialog(null);
      setMessage({ kind: "success", text: done });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/transfers" className="mb-4 inline-block text-sm text-brand">
        ← Transfers
      </Link>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold text-ink">{t.code}</h1>
          <p className="text-sm text-ink">
            {t.from?.path} → <strong>{t.to?.path}</strong>
          </p>
          <p className="text-xs text-muted">
            Sent {new Date(t.sentAt).toLocaleString()} by {t.sentBy.name}
            {t.receivedBy && ` · received by ${t.receivedBy.name}`}
          </p>
          {t.note && <p className="mt-1 text-sm text-ink">{t.note}</p>}
          {t.closedReason && <p className="mt-1 text-sm text-danger">{t.status === "CANCELLED" ? "Cancelled" : "Closed with items missing"}: {t.closedReason}</p>}
        </div>
        <Badge tone={TRANSFER_STATUS[t.status].tone}>{TRANSFER_STATUS[t.status].label}</Badge>
      </div>

      {message && (
        <div className="mb-4">
          <Alert kind={message.kind}>{message.text}</Alert>
        </div>
      )}

      {canReceive && (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              scan(code);
              setCode("");
            }}
          >
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan each item as it arrives" autoComplete="off" aria-label="Scan item" />
            <Button type="button" variant="secondary" onClick={() => setCamera((v) => !v)} aria-pressed={camera}>
              📷
            </Button>
          </form>
          {camera && <CameraScanner onScan={scan} />}
        </div>
      )}

      <ul className="divide-y divide-line rounded-xl border border-line bg-white">
        {t.lines.map((l) => (
          <li key={l.id} className="flex items-center gap-3 p-3">
            <Thumb src={l.variant.product.images[0]} size="size-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{itemName(l)}</p>
              <p className="text-xs text-muted">
                Sent {l.quantity} · received {l.received}
                {l.lost > 0 && <span className="text-danger"> · lost {l.lost}</span>}
              </p>
            </div>
            {canReceive && left(l) > 0 ? (
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={left(l)}
                value={counts[l.variantId] ?? 0}
                onChange={(e) => setCounts({ ...counts, [l.variantId]: Math.min(left(l), Math.max(0, Number(e.target.value) || 0)) })}
                className="h-10 min-h-10! w-20!"
                aria-label={`Arrived: ${itemName(l)}`}
              />
            ) : (
              <span className={`font-semibold ${left(l) === 0 ? "text-ok" : "text-ink"}`}>{left(l) === 0 ? "✓" : `${left(l)} left`}</span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        {canReceive && (
          <Button
            onClick={() =>
              post(
                "receive",
                { lines: Object.entries(counts).filter(([, n]) => n > 0).map(([variantId, quantity]) => ({ variantId, quantity })) },
                `Received ${toReceive} item(s) into ${t.to?.path}.`,
              )
            }
            disabled={busy || toReceive === 0}
          >
            {busy ? "Saving…" : `Receive ${toReceive || ""} into stock here`}
          </Button>
        )}
        {open && can(user?.role, "stockAdjust") && t.lines.some((l) => l.received > 0) && (
          <Button variant="ghost" className="text-danger" onClick={() => setDialog("close")}>
            Close — the rest never arrived
          </Button>
        )}
        {open && t.lines.every((l) => l.received === 0) && (can(user?.role, "stockAdjust") || t.sentById === user?.id) && (
          <Button variant="ghost" className="text-danger" onClick={() => setDialog("cancel")}>
            Cancel transfer
          </Button>
        )}
      </div>

      <Modal title={dialog === "close" ? "Close with items missing" : "Cancel transfer"} open={!!dialog} onClose={() => setDialog(null)}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (dialog === "close") post("close", { reason }, "Closed — missing items written off as lost.");
            else post("cancel", { reason }, "Cancelled — the stock is back where it came from.");
          }}
        >
          <p className="text-sm text-muted">
            {dialog === "close" ? "Items not received are written off as “lost in transfer”. This is recorded with your name and reason." : "Everything goes back to where it was sent from."}
          </p>
          <Field label="Reason">{(fid) => <Input id={fid} value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={300} autoFocus />}</Field>
          <Button type="submit" variant="danger" disabled={busy}>
            {dialog === "close" ? "Close transfer" : "Cancel transfer"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
