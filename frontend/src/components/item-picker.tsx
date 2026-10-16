"use client";

import { useEffect, useRef, useState } from "react";
import { CameraScanner } from "@/components/camera-scanner";
import { Icon } from "@/components/icons";
import { Thumb } from "@/components/thumb";
import { Alert, Button, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { scanError, scanSuccess } from "@/lib/feedback";
import { itemLabel, lookupCode, pickOptions, type PickedItem } from "@/lib/stock";
import type { Page, Product, ProductListItem } from "@/lib/types";

/**
 * Find an item by scanning its barcode (a USB/Bluetooth scanner types the code and presses
 * Enter) or by searching. Products with several variants / boxes ask which one.
 */
export function ItemPicker({
  value,
  onChange,
  initialProductId,
  initialVariantId,
  camera = true,
}: {
  value: PickedItem | null;
  onChange: (item: PickedItem | null) => void;
  /** Show the camera-scan button (off where the page already has its own). */
  camera?: boolean;
  /** Open this product's choices straight away (coming from a product page). */
  initialProductId?: string;
  initialVariantId?: string;
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<ProductListItem[]>([]);
  const [choosing, setChoosing] = useState<PickedItem[] | null>(null);
  const [error, setError] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function choose(options: PickedItem[]) {
    setResults([]);
    setText("");
    if (options.length === 1) {
      setChoosing(null);
      onChange(options[0]);
    } else {
      setChoosing(options);
    }
  }

  // Prefill from ?product= (and ?variant= to skip the "which one?" step).
  useEffect(() => {
    if (!initialProductId) return;
    api<Product>(`/products/${initialProductId}`)
      .then((p) => {
        const options = pickOptions(p);
        const exact = options.find((o) => o.variantId === initialVariantId);
        choose(exact ? [exact] : options);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on first load
  }, [initialProductId]);

  // Search as you type.
  const q = text.trim();
  const shown = q.length >= 2 ? results : [];
  useEffect(() => {
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      api<Page<ProductListItem>>("/products", { query: { q, pageSize: 8, status: "ACTIVE" } })
        .then((res) => setResults(res.items))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  /** Looks a scanned/typed code up exactly. Returns false when no item has that code. */
  async function lookup(code: string, fallbackToSearch: boolean) {
    setError("");
    try {
      const item = await lookupCode(code);
      setText("");
      setResults([]);
      setChoosing(null);
      onChange(item);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        if (fallbackToSearch && shown.length === 1) {
          choose(pickOptions(shown[0]));
          return true;
        }
        setError(`No item has the barcode "${code}". Search by name instead.`);
      } else {
        setError(e instanceof Error ? e.message : "Lookup failed");
      }
      return false;
    }
  }

  /** Enter = a scanner finished typing a code: look it up exactly. */
  async function onEnter() {
    const code = text.trim();
    if (code) await lookup(code, true);
  }

  /** A code read by the phone camera. */
  async function onCameraScan(code: string) {
    const found = await lookup(code.trim(), false);
    if (found) scanSuccess();
    else scanError();
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-brand/30 bg-brand/5 p-3">
        <Thumb src={value.image} size="size-12" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{itemLabel(value)}</p>
          <p className="font-mono text-xs text-muted">{value.code}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="px-3"
          onClick={() => {
            onChange(null);
            setTimeout(() => inputRef.current?.focus());
          }}
        >
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <Alert>{error}</Alert>}
      {choosing ? (
        <div className="rounded-lg border border-line">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-sm font-medium text-ink">{choosing[0].productName}: which one?</p>
            <button type="button" className="text-sm text-brand" onClick={() => setChoosing(null)}>
              Back
            </button>
          </div>
          <ul className="divide-y divide-line">
            {choosing.map((o) => (
              <li key={o.variantId}>
                <button
                  type="button"
                  onClick={() => choose([o])}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface"
                >
                  <span className={`min-w-0 wrap-break-word ${o.kind === "KIT" ? "font-semibold text-ink" : "text-ink"}`}>{o.variantName}</span>
                  <span className="shrink-0 font-mono text-xs text-muted">{o.code}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onEnter();
                }
              }}
              placeholder="Scan barcode or type a name, SKU or code"
              autoFocus
              autoComplete="off"
              aria-label="Item"
            />
            {camera && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCamera((v) => !v)}
                aria-pressed={showCamera}
                aria-label={showCamera ? "Close camera" : "Scan with camera"}
                title={showCamera ? "Close camera" : "Scan with camera"}
                className={`shrink-0 px-3.5 ${showCamera ? "border-brand/50 bg-brand/10 text-brand" : ""}`}
              >
                <Icon name="scan" />
              </Button>
            )}
          </div>
          {camera && showCamera && <CameraScanner onScan={onCameraScan} />}
          {shown.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {shown.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => choose(pickOptions(p))}
                    className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface"
                  >
                    <Thumb src={p.images[0]} size="size-9" />
                    <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
                    {p.type === "KIT" && <span className="text-xs text-muted">kit</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
