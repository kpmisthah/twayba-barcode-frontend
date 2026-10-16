"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraScanner } from "@/components/camera-scanner";
import { LocationPicker } from "@/components/location-picker";
import { Alert, Badge, Button, Input, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { scanError, scanSuccess } from "@/lib/feedback";
import { can } from "@/lib/permissions";
import { lookupCode } from "@/lib/stock";
import type { Location, Stocktake } from "@/lib/types";
import { STATUS_LABELS } from "../status";

type Line = Stocktake["lines"][number];

export default function StocktakePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canCount = can(user?.role, "stockWrite");
  const canApprove = can(user?.role, "stockAdjust");
  const [st, setSt] = useState<Stocktake | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [confirmMissing, setConfirmMissing] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const spaceRef = useRef("");

  const load = useCallback(() => api<Stocktake>(`/stocktakes/${id}`).then(setSt), [id]);
  useEffect(() => {
    load().catch((e) => setMessage({ kind: "error", text: e.message }));
    api<Location[]>("/locations").then(setLocations).catch(() => undefined);
  }, [load]);
  useEffect(() => {
    spaceRef.current = spaceId;
  }, [spaceId]);

  const spaceOptions = useMemo(() => {
    const ids = new Set(st?.spaces.map((s) => s.id));
    return locations.filter((l) => ids.has(l.id)).map((location) => ({ location }));
  }, [st, locations]);

  /** Each scan adds 1 to that item at the chosen space. */
  const onScan = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value) return;
      // A location label switches the space being counted.
      const label = st?.spaces.find((s) => s.code === value.toUpperCase());
      if (label) {
        setSpaceId(label.id);
        scanSuccess();
        setMessage({ kind: "success", text: `Now counting ${label.path}` });
        return;
      }
      if (!spaceRef.current) {
        scanError();
        setMessage({ kind: "error", text: "First choose (or scan) the space you are counting" });
        return;
      }
      try {
        const item = await lookupCode(value);
        if (item.kind === "KIT") throw new Error("Count each box of a kit, not the kit");
        await api(`/stocktakes/${id}/counts`, { method: "PUT", body: { variantId: item.variantId, locationId: spaceRef.current, add: 1 } });
        scanSuccess();
        setMessage({ kind: "success", text: `+1 ${item.variantName === "Default" ? item.productName : `${item.productName} – ${item.variantName}`}` });
        await load();
      } catch (e) {
        scanError();
        setMessage({ kind: "error", text: e instanceof ApiError && e.status === 404 ? `Unknown code "${value}"` : e instanceof Error ? e.message : "Could not count" });
      }
    },
    [id, st, load],
  );

  async function setCount(line: Line, value: string) {
    if (value === "" || Number(value) === line.counted) return;
    try {
      await api(`/stocktakes/${id}/counts`, { method: "PUT", body: { variantId: line.variantId, locationId: line.locationId, counted: Number(value) } });
      await load();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Could not save the count" });
    }
  }

  async function action(path: string, body?: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      setSt(await api<Stocktake>(`/stocktakes/${id}/${path}`, { method: "POST", body: body ?? {} }));
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }

  if (!st) return message ? <Alert>{message.text}</Alert> : <Spinner />;

  const counting = st.status === "COUNTING";
  const uncounted = st.lines.filter((l) => l.counted === null).length;
  const withDiff = st.lines.filter((l) => (l.variance ?? 0) !== 0);
  const shown = onlyDiffs ? withDiff : st.lines;
  const groups = new Map<string, Line[]>();
  for (const l of shown) groups.set(l.path, [...(groups.get(l.path) ?? []), l]);
  const prefix = st.location.path;

  return (
    <div className="mx-auto max-w-4xl pb-10">
      <Link href="/stocktakes" className="mb-4 inline-block text-sm text-brand">
        ← Stocktake
      </Link>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">
            <span className="font-mono">{st.code}</span> · {st.location.path}
          </h1>
          <p className="text-sm text-muted">
            Started {new Date(st.createdAt).toLocaleString()} by {st.createdBy.name}
            {st.submittedBy && ` · submitted by ${st.submittedBy.name}`}
            {st.approvedBy && ` · approved by ${st.approvedBy.name}`}
          </p>
          {st.note && <p className="text-sm text-ink">{st.note}</p>}
        </div>
        <Badge tone={STATUS_LABELS[st.status].tone}>{STATUS_LABELS[st.status].label}</Badge>
      </div>

      {message && (
        <div className="mb-4">
          <Alert kind={message.kind}>{message.text}</Alert>
        </div>
      )}

      {counting && canCount && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
          <LocationPicker label="Counting at" options={spaceOptions} value={spaceId} onChange={setSpaceId} empty="No spaces inside this location." />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onScan(code);
              setCode("");
            }}
          >
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan an item (+1 each scan)" autoComplete="off" aria-label="Scan item" />
            <Button type="button" variant="secondary" onClick={() => setCamera((v) => !v)} aria-pressed={camera}>
              📷
            </Button>
          </form>
          {camera && <CameraScanner onScan={onScan} />}
          <p className="text-xs text-muted">Scanning the same item again adds 1. You can also type a count in the list below.</p>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted">
          {st.lines.length} lines · {uncounted} not counted · <span className={withDiff.length ? "font-semibold text-danger" : ""}>{withDiff.length} with differences</span>
        </p>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-4" checked={onlyDiffs} onChange={(e) => setOnlyDiffs(e.target.checked)} />
          Only differences
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-6 text-sm text-muted">{onlyDiffs ? "No differences." : "Nothing expected here — scan what you find."}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {[...groups.entries()].map(([path, lines]) => (
            <section key={path} className="overflow-hidden rounded-xl border border-line bg-white">
              <h2 className="border-b border-line bg-surface px-4 py-2 text-sm font-semibold text-ink">{path.startsWith(prefix) && path !== prefix ? path.slice(prefix.length + 3) : path}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="px-4 py-2 font-medium">Item</th>
                      <th className="px-2 py-2 text-right font-medium">System</th>
                      <th className="px-2 py-2 text-right font-medium">Counted</th>
                      <th className="px-4 py-2 text-right font-medium">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {lines.map((l) => (
                      <tr key={l.id} className={l.counted === null ? "bg-brand/5" : ""}>
                        <td className="px-4 py-2">
                          <p className="text-ink">
                            {l.variant.product.name}
                            {l.variant.name !== "Default" && ` – ${l.variant.name}`}
                          </p>
                          <p className="font-mono text-xs text-muted">{l.variant.code}</p>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted">{l.onHand}</td>
                        <td className="px-2 py-2 text-right">
                          {counting && canCount ? (
                            <Input
                              key={`${l.id}:${l.counted}`}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              defaultValue={l.counted ?? ""}
                              placeholder="—"
                              onBlur={(e) => setCount(l, e.target.value)}
                              className="ml-auto h-10 min-h-10! w-20! text-right"
                              aria-label={`Counted ${l.variant.product.name}`}
                            />
                          ) : (
                            <span className="tabular-nums">{l.counted ?? "—"}</span>
                          )}
                        </td>
                        <td className={`px-4 py-2 text-right font-semibold tabular-nums ${!l.variance ? "text-muted" : l.variance > 0 ? "text-ok" : "text-danger"}`}>
                          {l.variance === null ? "—" : l.variance > 0 ? `+${l.variance}` : l.variance}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
        {counting && canCount && (
          <>
            {uncounted > 0 && (
              <label className="flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" className="mt-0.5 size-4" checked={confirmMissing} onChange={(e) => setConfirmMissing(e.target.checked)} />
                The {uncounted} item(s) not counted were not found — count them as 0
              </label>
            )}
            <Button onClick={() => action("submit", { uncountedAsZero: confirmMissing })} disabled={busy || (uncounted > 0 && !confirmMissing)}>
              Finish counting & send for approval
            </Button>
          </>
        )}
        {st.status === "SUBMITTED" && (
          <>
            <p className="text-sm text-muted">
              {withDiff.length
                ? `${withDiff.length} difference(s). Approving corrects the stock with these differences (each counted against what the system held at counting time).`
                : "No differences — approving just closes the stocktake."}
            </p>
            {canApprove ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => action("approve")} disabled={busy}>
                  Approve & correct stock
                </Button>
                <Button variant="secondary" onClick={() => action("reopen")} disabled={busy}>
                  Send back for recount
                </Button>
              </div>
            ) : (
              <p className="text-sm text-ink">Waiting for an admin or manager to approve.</p>
            )}
          </>
        )}
        {st.status === "APPROVED" && <p className="text-sm text-ok">Stock corrected. Each change is in Stock history with reference {st.code}.</p>}
        {(counting || st.status === "SUBMITTED") && canApprove && (
          <Button variant="ghost" className="self-start text-danger" onClick={() => action("cancel")} disabled={busy}>
            Cancel this stocktake
          </Button>
        )}
      </div>
    </div>
  );
}
