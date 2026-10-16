"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CameraScanner } from "@/components/camera-scanner";
import { LocationStockView } from "@/components/location-stock";
import { PageHeader } from "@/components/page-header";
import { Thumb } from "@/components/thumb";
import { Badge, Input, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { scanError, scanSuccess } from "@/lib/feedback";
import { can } from "@/lib/permissions";
import { formatMoney, useSettings } from "@/lib/settings";
import type { Location, ProductStock, VariantKind } from "@/lib/types";

interface ScannedItem {
  code: string;
  variant: {
    id: string;
    kind: VariantKind;
    code: string;
    sku: string;
    name: string;
    price: string | null;
    product: { id: string; name: string; status: string; images: string[]; minStock: number };
    usedInKits: { quantity: number; kitVariant: { id: string; productId: string } }[];
  };
}

type Result =
  | { kind: "item"; scanned: ScannedItem; stock: ProductStock }
  | { kind: "location"; location: Location }
  | { kind: "unknown"; code: string; message: string };

export default function ScanPage() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [flash, setFlash] = useState<"ok" | "bad" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // USB/Bluetooth scanners type into the focused box — focus it on desktops (not on phones,
  // where it would pop up the keyboard over the camera).
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  const handle = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    setBusy(true);
    try {
      if (/^LOC-/i.test(code)) {
        const location = await api<Location>("/locations/lookup", { query: { code } });
        setResult({ kind: "location", location });
      } else {
        const scanned = await api<ScannedItem>(`/barcodes/lookup/${encodeURIComponent(code)}`);
        const stock = await api<ProductStock>(`/stock/products/${scanned.variant.product.id}`);
        setResult({ kind: "item", scanned, stock });
      }
      scanSuccess();
      setFlash("ok");
    } catch (e) {
      scanError();
      setFlash("bad");
      setResult({
        kind: "unknown",
        code,
        message: e instanceof ApiError && e.status === 404 ? "This code isn't in the system." : e instanceof Error ? e.message : "Lookup failed",
      });
    } finally {
      setBusy(false);
      setTimeout(() => setFlash(null), 600);
    }
  }, []);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Scan" description="Scan a product barcode or a location label." />

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
        <CameraScanner onScan={handle} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handle(text);
            setText("");
          }}
        >
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="…or type / scan a code and press Enter"
            autoComplete="off"
            enterKeyHint="search"
            aria-label="Code"
          />
        </form>
      </div>

      <div
        className={`mt-4 rounded-xl transition-shadow duration-300 ${
          flash === "ok" ? "shadow-[0_0_0_4px_var(--color-ok)]" : flash === "bad" ? "shadow-[0_0_0_4px_var(--color-danger)]" : ""
        }`}
        aria-live="polite"
      >
        {busy && !result && <Spinner />}
        {result?.kind === "unknown" && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-5">
            <p className="font-semibold text-danger">Not found</p>
            <p className="mt-1 text-sm text-ink">
              <span className="font-mono">{result.code}</span> — {result.message}
            </p>
          </div>
        )}
        {result?.kind === "item" && <ItemResult key={result.scanned.variant.id + result.stock.items.length} {...result} />}
        {result?.kind === "location" && <LocationResult key={result.location.id} location={result.location} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ product

function ItemResult({ scanned, stock }: { scanned: ScannedItem; stock: ProductStock }) {
  const { user } = useAuth();
  const settings = useSettings();
  const v = scanned.variant;
  const p = v.product;
  const item = stock.items.find((i) => i.variantId === v.id);
  const t = item?.totals;
  const isBox = v.kind === "COMPONENT";
  const canMove = can(user?.role, "stockWrite");
  const target = `product=${p.id}&variant=${v.id}`;

  return (
    <div className="rounded-xl border border-line bg-white">
      <div className="flex gap-4 p-5">
        <Thumb src={p.images[0]} size="size-20" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">{p.name}</h2>
          {v.name !== "Default" && <p className="text-ink">{v.name}</p>}
          <div className="mt-1 flex flex-wrap gap-2">
            {isBox && <Badge tone="brand">Box of a kit</Badge>}
            {p.status === "INACTIVE" && <Badge tone="muted">Inactive</Badge>}
            {item?.low && <Badge tone="brand">Low stock</Badge>}
          </div>
          <p className="mt-2 text-sm text-muted">
            SKU <span className="font-mono text-ink">{v.sku}</span>
            {scanned.code !== v.code && (
              <>
                {" "}
                · barcode <span className="font-mono text-ink">{scanned.code}</span>
              </>
            )}
          </p>
          {!isBox && v.price && <p className="mt-1 text-lg font-semibold text-ink">{formatMoney(v.price, settings?.currency)}</p>}
        </div>
      </div>

      <div className="border-t border-line p-5">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-muted">
          <span>
            Available <span className="text-2xl font-semibold tabular-nums text-ink">{t?.available ?? 0}</span>
          </span>
          <span>
            In store <span className="font-medium tabular-nums text-ink">{t?.onHand ?? 0}</span>
          </span>
          {!!t?.reserved && (
            <span>
              Reserved <span className="font-medium text-ink">{t.reserved}</span>
            </span>
          )}
          {!!t?.inTransit && (
            <span>
              In transit <span className="font-medium text-ink">{t.inTransit}</span>
            </span>
          )}
          {!!t?.damaged && (
            <span>
              Damaged <span className="font-medium text-ink">{t.damaged}</span>
            </span>
          )}
        </div>
        {isBox && stock.kit && (
          <p className="mt-2 text-sm text-muted">
            Kit: <span className="font-semibold text-ink">{stock.kit.sellable}</span> complete kits available
          </p>
        )}

        {item && item.locations.length > 0 ? (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
            {item.locations.map((l) => (
              <li key={l.locationId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="text-ink">{l.path}</span>
                <span className="shrink-0 font-semibold tabular-nums text-ink">
                  {l.onHand}
                  {l.reserved > 0 && <span className="ml-1 text-xs font-normal text-muted">({l.reserved} reserved)</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Not stored anywhere yet.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-line p-4 sm:grid-cols-3">
        {canMove && (
          <>
            <Action href={`/stock?tab=add&${target}`} label="+ Add" />
            <Action href={`/stock?tab=remove&${target}`} label="Remove" />
            <Action href={`/stock?tab=move&${target}`} label="Move" />
          </>
        )}
        <Action href={`/products/${p.id}`} label="Details & history" />
        {can(user?.role, "pos") && <Action href="/pos" label="Sell (POS)" />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ location

function LocationResult({ location }: { location: Location }) {
  const { user } = useAuth();
  const canMove = can(user?.role, "stockWrite");
  const isSystem = location.type === "TRANSIT" || location.type === "DAMAGED";

  return (
    <div className="rounded-xl border border-line bg-white">
      <div className="border-b border-line p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Location</p>
        <h2 className="mt-1 text-lg font-semibold text-ink">{location.name}</h2>
        <p className="font-mono text-xs text-muted">{location.code}</p>
      </div>
      <div className="p-5">
        <LocationStockView locationId={location.id} />
      </div>
      {canMove && !isSystem && (
        <div className="grid grid-cols-2 gap-2 border-t border-line p-4">
          <Action href={`/stock?tab=add&to=${location.id}`} label="+ Add stock here" />
          <Action href={`/stock?tab=move&from=${location.id}`} label="Move stock out" />
        </div>
      )}
    </div>
  );
}

function Action({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-3 text-center text-sm font-semibold text-ink hover:bg-surface"
    >
      {label}
    </Link>
  );
}
