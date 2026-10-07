"use client";

import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api, apiBlob } from "@/lib/api";
import type { Product, Variant } from "@/lib/types";
import { infoPayload, ProductInfoFields, useCatalogOptions, type ProductInfo } from "../product-info-fields";

type Saved = (product: Product) => void;

/** Shared submit/error handling for the small forms below. */
function useSubmit<T>(fn: () => Promise<T>, onDone: (r: T) => void) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      onDone(await fn());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }
  return { error, saving, submit };
}

const toNumber = (v: string) => (v.trim() === "" ? null : Number(v));

export function EditInfoForm({ product, onSaved }: { product: Product; onSaved: Saved }) {
  const { categories, taxRates } = useCatalogOptions();
  const [info, setInfo] = useState<ProductInfo>({
    name: product.name,
    description: product.description ?? "",
    categoryId: product.category?.id ?? "",
    brand: product.brand ?? "",
    taxRateId: product.taxRate?.id ?? "",
    minStock: String(product.minStock),
    status: product.status,
    images: product.images,
  });
  const { error, saving, submit } = useSubmit(() => {
    const p = infoPayload(info);
    return api<Product>(`/products/${product.id}`, {
      method: "PATCH",
      body: {
        ...p,
        description: p.description ?? null,
        categoryId: p.categoryId ?? null,
        brand: p.brand ?? null,
        taxRateId: p.taxRateId ?? null,
      },
    });
  }, onSaved);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <ProductInfoFields value={info} onChange={setInfo} categories={categories} taxRates={taxRates} />
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

/** Edits a single variant, the kit price, or one box — fields depend on the kind. */
export function EditVariantForm({
  variant,
  boxQuantity,
  showCost,
  onSaved,
}: {
  variant: Variant;
  boxQuantity?: number;
  showCost: boolean;
  onSaved: Saved;
}) {
  const isBox = variant.kind === "COMPONENT";
  const [sku, setSku] = useState(variant.sku);
  const [color, setColor] = useState(variant.color ?? "");
  const [size, setSize] = useState(variant.size ?? "");
  const [label, setLabel] = useState(variant.name.replace(/^Box [A-Z]+( – )?/, ""));
  const [quantity, setQuantity] = useState(String(boxQuantity ?? 1));
  const [price, setPrice] = useState(variant.price ?? "");
  const [costPrice, setCostPrice] = useState(variant.costPrice ?? "");
  const [active, setActive] = useState(variant.active);

  const { error, saving, submit } = useSubmit(() => {
    const body: Record<string, unknown> = { sku: sku.trim() };
    if (variant.kind === "STANDARD") Object.assign(body, { color: color.trim() || null, size: size.trim() || null });
    if (isBox) Object.assign(body, { label: label.trim() || null, quantity: Number(quantity) });
    if (!isBox) {
      body.price = Number(price);
      if (showCost) body.costPrice = toNumber(costPrice);
    }
    if (variant.kind !== "KIT") body.active = active;
    return api<Product>(`/variants/${variant.id}`, { method: "PATCH", body });
  }, onSaved);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <p className="text-sm text-muted">
        System code <span className="font-mono text-ink">{variant.code}</span> never changes, so printed labels stay valid.
      </p>
      {variant.kind === "STANDARD" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Colour">{(id) => <Input id={id} value={color} onChange={(e) => setColor(e.target.value)} />}</Field>
          <Field label="Size">{(id) => <Input id={id} value={size} onChange={(e) => setSize(e.target.value)} />}</Field>
        </div>
      )}
      {isBox && (
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="What's inside">{(id) => <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} />}</Field>
          <Field label="Boxes per kit">
            {(id) => <Input id={id} type="number" min={1} max={99} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />}
          </Field>
        </div>
      )}
      {!isBox && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Selling price">
            {(id) => <Input id={id} type="number" min={0} step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />}
          </Field>
          {showCost && (
            <Field label="Cost price">
              {(id) => <Input id={id} type="number" min={0} step="0.01" inputMode="decimal" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />}
            </Field>
          )}
        </div>
      )}
      <Field label="SKU">{(id) => <Input id={id} value={sku} onChange={(e) => setSku(e.target.value)} required />}</Field>
      {variant.kind !== "KIT" && (
        <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
          <input type="checkbox" className="size-5" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
      )}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

export function AddVariantForm({ productId, onSaved }: { productId: string; onSaved: Saved }) {
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [barcode, setBarcode] = useState("");
  const { error, saving, submit } = useSubmit(
    () =>
      api<Product>(`/products/${productId}/variants`, {
        method: "POST",
        body: {
          color: color.trim() || undefined,
          size: size.trim() || undefined,
          price: Number(price),
          costPrice: toNumber(costPrice) ?? undefined,
          barcode: barcode.trim() || undefined,
        },
      }),
    onSaved,
  );
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Colour">{(id) => <Input id={id} value={color} onChange={(e) => setColor(e.target.value)} autoFocus />}</Field>
        <Field label="Size">{(id) => <Input id={id} value={size} onChange={(e) => setSize(e.target.value)} />}</Field>
        <Field label="Selling price">
          {(id) => <Input id={id} type="number" min={0} step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />}
        </Field>
        <Field label="Cost price">
          {(id) => <Input id={id} type="number" min={0} step="0.01" inputMode="decimal" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />}
        </Field>
      </div>
      <Field label="Supplier barcode (optional)">{(id) => <Input id={id} value={barcode} onChange={(e) => setBarcode(e.target.value)} />}</Field>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Add variant"}
      </Button>
    </form>
  );
}

export function AddBoxForm({ productId, nextLetter, onSaved }: { productId: string; nextLetter: string; onSaved: Saved }) {
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [barcode, setBarcode] = useState("");
  const { error, saving, submit } = useSubmit(
    () =>
      api<Product>(`/products/${productId}/components`, {
        method: "POST",
        body: { label: label.trim() || undefined, quantity: Number(quantity), barcode: barcode.trim() || undefined },
      }),
    onSaved,
  );
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <p className="text-sm text-muted">This will be Box {nextLetter}. Existing kits in stock will now need this box too.</p>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Field label="What's inside (optional)">{(id) => <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />}</Field>
        <Field label="Boxes per kit">
          {(id) => <Input id={id} type="number" min={1} max={99} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />}
        </Field>
      </div>
      <Field label="Supplier barcode (optional)">{(id) => <Input id={id} value={barcode} onChange={(e) => setBarcode(e.target.value)} />}</Field>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : `Add Box ${nextLetter}`}
      </Button>
    </form>
  );
}

export function AddBarcodeForm({ variant, onSaved }: { variant: Variant; onSaved: Saved }) {
  const [code, setCode] = useState("");
  const { error, saving, submit } = useSubmit(
    () => api<Product>(`/variants/${variant.id}/barcodes`, { method: "POST", body: { code: code.trim() } }),
    onSaved,
  );
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <p className="text-sm text-muted">
        Add a supplier barcode for <strong className="text-ink">{variant.name}</strong>. Scanning either code will find this item. A
        barcode can never be moved to another item.
      </p>
      <Field label="Barcode" hint="Tip: click here and scan the barcode with a USB/Bluetooth scanner">
        {(id) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value)} required autoFocus autoComplete="off" />}
      </Field>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Add barcode"}
      </Button>
    </form>
  );
}

/** Choose how many labels to print per item, then open the PDF. */
export function PrintLabelsForm({ product, onDone }: { product: Product; onDone: () => void }) {
  const kit = product.variants.find((v) => v.kind === "KIT");
  const printable = product.variants.filter((v) => v.active && v.kind !== "KIT");
  const [kitCopies, setKitCopies] = useState(kit ? "1" : "0");
  const [copies, setCopies] = useState<Record<string, string>>(() =>
    Object.fromEntries(printable.map((v) => [v.id, kit ? "0" : "1"])),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function print(e: React.FormEvent) {
    e.preventDefault();
    const items = [
      ...(kit && Number(kitCopies) > 0 ? [{ variantId: kit.id, copies: Number(kitCopies) }] : []),
      ...printable.filter((v) => Number(copies[v.id]) > 0).map((v) => ({ variantId: v.id, copies: Number(copies[v.id]) })),
    ];
    if (!items.length) {
      setError("Enter how many labels to print");
      return;
    }
    // Open the tab now (before awaiting) so the browser doesn't block it as a pop-up.
    const tab = window.open("", "_blank");
    setBusy(true);
    setError("");
    try {
      const pdf = await apiBlob("/labels/products", { method: "POST", body: { items } });
      const url = URL.createObjectURL(pdf);
      if (tab) tab.location.href = url;
      else window.location.href = url;
      onDone();
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Could not create labels");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={print} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      {kit && (
        <div className="rounded-lg border border-brand/30 bg-brand/5 p-4">
          <Field label="Complete kits" hint="Prints every box label for this many kits">
            {(id) => <Input id={id} type="number" min={0} max={500} value={kitCopies} onChange={(e) => setKitCopies(e.target.value)} />}
          </Field>
        </div>
      )}
      <p className="text-sm font-medium text-ink">{kit ? "Or extra labels for single boxes" : "Labels per item"}</p>
      <ul className="flex flex-col gap-2">
        {printable.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-sm">
              <span className="block truncate text-ink">{v.name}</span>
              <span className="font-mono text-xs text-muted">{v.code}</span>
            </span>
            <Input
              type="number"
              min={0}
              max={500}
              className="w-24!"
              aria-label={`Labels for ${v.name}`}
              value={copies[v.id]}
              onChange={(e) => setCopies({ ...copies, [v.id]: e.target.value })}
            />
          </li>
        ))}
      </ul>
      <Button type="submit" disabled={busy}>
        {busy ? "Creating PDF…" : "Open labels PDF"}
      </Button>
      <p className="text-xs text-muted">Label size is set in Settings. Print at 100% scale (no “fit to page”).</p>
    </form>
  );
}
