"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ItemPicker } from "@/components/item-picker";
import { LocationPicker, type LocationOption } from "@/components/location-picker";
import { PageHeader } from "@/components/page-header";
import { ProductStockPanel } from "@/components/stock";
import { Alert, Button, Field, Input, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ADD_REASONS, canUseSite, itemLabel, REMOVE_REASONS, stockableLocations, type PickedItem } from "@/lib/stock";
import type { Location, ProductStock } from "@/lib/types";

type Mode = "add" | "remove" | "move";

const MODES: { mode: Mode; label: string; hint: string }[] = [
  { mode: "add", label: "Add", hint: "Stock arriving: a delivery from a supplier, a return, or found items." },
  { mode: "remove", label: "Remove", hint: "Stock leaving for any reason other than a sale: damaged, lost, expired…" },
  { mode: "move", label: "Move", hint: "Move stock from one place to another, e.g. garage → shop display." },
];

export default function StockPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <StockActions />
    </Suspense>
  );
}

function StockActions() {
  const params = useSearchParams();
  const initialMode = MODES.find((m) => m.mode === params.get("tab"))?.mode ?? "add";
  const initialProductId = params.get("product") ?? undefined;
  const initialVariantId = params.get("variant") ?? undefined;
  /** From a scanned location label: put stock here / take it from here. */
  const initialFrom = params.get("from") ?? "";
  const initialTo = params.get("to") ?? "";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [item, setItem] = useState<PickedItem | null>(null);
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [stock, setStock] = useState<ProductStock | null>(null);
  const [error, setError] = useState("");
  /** Bumped after each save so the stock panel beside the form reloads. */
  const [stockVersion, setStockVersion] = useState(0);

  useEffect(() => {
    api<Location[]>("/locations")
      .then(setLocations)
      .catch((e) => setError(e.message));
  }, []);

  const loadStock = useCallback(() => {
    if (!item) return;
    api<ProductStock>(`/stock/products/${item.productId}`)
      .then(setStock)
      .catch((e) => setError(e.message));
  }, [item]);
  useEffect(loadStock, [loadStock]);
  // Ignore stock still loaded for a previously chosen product.
  const itemStock = stock && item && stock.productId === item.productId ? stock : null;

  const current = MODES.find((m) => m.mode === mode)!;

  return (
    <div className={`mx-auto ${item ? "max-w-5xl" : "max-w-2xl"}`}>
      <PageHeader title="Update stock" description={current.hint} />

      <div className="mb-5 flex max-w-2xl gap-1 rounded-xl bg-surface p-1" role="tablist" aria-label="Action">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            role="tab"
            aria-selected={mode === m.mode}
            onClick={() => setMode(m.mode)}
            className={`min-h-11 flex-1 rounded-lg text-sm font-semibold transition-all ${
              mode === m.mode ? "bg-white text-brand shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 max-w-2xl">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,42rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex flex-col gap-5 rounded-xl border border-line bg-white p-4 shadow-sm sm:p-5">
            <Field label="Item">{() => <ItemPicker value={item} onChange={setItem} initialProductId={initialProductId} initialVariantId={initialVariantId} />}</Field>

            {item && !locations && <Spinner />}
            {item && locations && (
              <StockForm
                key={`${mode}:${item.variantId}`}
                mode={mode}
                item={item}
                locations={locations}
                stock={itemStock}
                initialFrom={initialFrom}
                initialTo={initialTo}
                onDone={() => {
                  loadStock();
                  setStockVersion((v) => v + 1);
                }}
              />
            )}
          </div>

          {item && (
            <p className="mt-4 text-sm">
              <Link href={`/products/${item.productId}`} className="font-medium text-brand hover:underline">
                View {item.productName} — stock and history →
              </Link>
            </p>
          )}
        </div>

        {/* Where this item is right now, so you can see the effect of what you just did. */}
        {item && <ProductStockPanel key={`${item.productId}:${stockVersion}`} productId={item.productId} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ form

function StockForm({
  mode,
  item,
  locations,
  stock,
  initialFrom,
  initialTo,
  onDone,
}: {
  mode: Mode;
  item: PickedItem;
  locations: Location[];
  stock: ProductStock | null;
  initialFrom: string;
  initialTo: string;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [pickedFrom, setFromId] = useState(initialFrom);
  const [toId, setToId] = useState(initialTo);
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const isKit = item.kind === "KIT";
  const unit = isKit ? "kit" : "item";
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  /** Where this item is now, with how many are free to take. */
  const sources: (LocationOption & { available: number })[] = useMemo(() => {
    if (!stock) return [];
    const counts = new Map<string, number>();
    if (isKit && stock.kit) {
      // Whole kits can only come from a place holding every box.
      const perBox = stock.kit.boxes.map((b) => ({
        perKit: b.perKit,
        at: new Map((stock.items.find((i) => i.variantId === b.variantId)?.locations ?? []).map((l) => [l.locationId, l.available])),
      }));
      const places = new Set(perBox.flatMap((b) => [...b.at.keys()]));
      for (const id of places) counts.set(id, Math.min(...perBox.map((b) => Math.floor((b.at.get(id) ?? 0) / b.perKit))));
    } else {
      for (const l of stock.items.find((i) => i.variantId === item.variantId)?.locations ?? []) counts.set(l.locationId, l.available);
    }
    return [...counts.entries()]
      .map(([id, available]) => ({ location: byId.get(id)!, available }))
      .filter((o) => o.location && o.available > 0 && o.location.type !== "TRANSIT" && o.location.type !== "DAMAGED" && canUseSite(user, o.location.siteId))
      .map((o) => ({ ...o, hint: `${o.available} ${isKit ? "complete kits" : "available"}` }));
  }, [stock, isKit, item.variantId, byId, user]);

  // A prefilled ?from= only counts if this item is actually there.
  const fromId = sources.some((s) => s.location.id === pickedFrom) ? pickedFrom : "";

  const destinations: LocationOption[] = useMemo(
    () => stockableLocations(locations, user).filter((l) => l.id !== fromId).map((location) => ({ location })),
    [locations, fromId, user],
  );

  const max = sources.find((s) => s.location.id === fromId)?.available;
  const noteNeeded = reason === "Other" || reason === "Damaged";
  const qty = Number(quantity);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isInteger(qty) || qty < 1) return setError("Enter a whole number of at least 1");
    if (max !== undefined && qty > max) return setError(`Only ${max} available there`);

    const base = { variantId: item.variantId, quantity: qty, note: note || undefined, reference: reference || undefined };
    const body =
      mode === "add"
        ? { ...base, type: "STOCK_IN", toLocationId: toId, reason }
        : mode === "move"
          ? { ...base, type: "TRANSFER", fromLocationId: fromId, toLocationId: toId }
          : reason === "Damaged"
            ? { ...base, type: "DAMAGE", fromLocationId: fromId }
            : { ...base, type: "STOCK_OUT", fromLocationId: fromId, reason };

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api("/stock/movements", { method: "POST", body });
      const what = `${qty} × ${itemLabel(item)}${isKit ? " (all boxes)" : ""}`;
      const from = byId.get(fromId)?.path;
      const to = byId.get(toId)?.path;
      setSuccess(
        mode === "add"
          ? `Added ${what} to ${to}`
          : mode === "move"
            ? `Moved ${what} from ${from} to ${to}`
            : `${reason === "Damaged" ? "Moved to Damaged" : "Removed"}: ${what} from ${from}`,
      );
      setQuantity("1");
      setNote("");
      if (mode !== "add") setFromId("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const needsSources = mode !== "add";
  if (needsSources && !stock) return <Spinner />;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {success && <Alert kind="success">{success}</Alert>}
      {error && <Alert>{error}</Alert>}

      {needsSources && (
        <LocationPicker
          label={mode === "move" ? "From" : "Take from"}
          options={sources}
          value={fromId}
          onChange={setFromId}
          empty={`No ${isKit ? "complete kits" : "stock"} of this ${unit} in any location.`}
        />
      )}
      {mode !== "remove" && (
        <LocationPicker
          label={mode === "move" ? "To" : "Put in"}
          options={destinations}
          value={toId}
          onChange={setToId}
          empty="No locations yet — add them on the Locations page."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={isKit ? "Complete kits" : "Quantity"} hint={max !== undefined ? `Up to ${max}` : undefined}>
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={max}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          )}
        </Field>
        {mode !== "move" && (
          <Field label="Reason">
            {(id) => (
              <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)} required>
                <option value="">Choose…</option>
                {(mode === "add" ? ADD_REASONS : REMOVE_REASONS).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>

      <Field label={reason === "Damaged" ? "What is damaged?" : noteNeeded ? "Note (required)" : "Note (optional)"}>
        {(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} required={noteNeeded} maxLength={500} />}
      </Field>
      {mode !== "remove" && (
        <Field label="Reference (optional)" hint={mode === "add" ? "e.g. supplier invoice number" : undefined}>
          {(id) => <Input id={id} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />}
        </Field>
      )}

      {isKit && (
        <p className="text-sm text-muted">Every box of the kit is {mode === "add" ? "added" : mode === "move" ? "moved" : "removed"} together.</p>
      )}

      <Button type="submit" disabled={saving || (needsSources && sources.length === 0)}>
        {saving ? "Saving…" : mode === "add" ? "Add stock" : mode === "move" ? "Move stock" : reason === "Damaged" ? "Mark damaged" : "Remove stock"}
      </Button>
    </form>
  );
}
