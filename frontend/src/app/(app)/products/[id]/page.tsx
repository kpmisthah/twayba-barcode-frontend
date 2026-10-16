"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MovementList, ProductStockPanel } from "@/components/stock";
import { Thumb } from "@/components/thumb";
import { Alert, Badge, Button, Modal, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatMoney, useSettings } from "@/lib/settings";
import type { Barcode, Product, Variant } from "@/lib/types";
import {
  AddBarcodeForm,
  AddBoxForm,
  AddVariantForm,
  EditInfoForm,
  EditVariantForm,
  PrintLabelsForm,
} from "./dialogs";

type Dialog =
  | { kind: "info" }
  | { kind: "labels" }
  | { kind: "addVariant" }
  | { kind: "addBox" }
  | { kind: "editVariant"; variant: Variant }
  | { kind: "addBarcode"; variant: Variant }
  | null;

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const justCreated = useSearchParams().get("created") === "1";
  const { user } = useAuth();
  const settings = useSettings();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);

  const canEdit = can(user?.role, "catalogWrite");
  const canPrint = can(user?.role, "labelPrint");
  const canMoveStock = can(user?.role, "stockWrite");
  const money = (v: string | null | undefined) => formatMoney(v, settings?.currency);

  const load = useCallback(() => {
    api<Product>(`/products/${id}`)
      .then(setProduct)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error && !product) return <Alert>{error}</Alert>;
  if (!product) return <Spinner />;

  const saved = (p: Product) => {
    setProduct(p);
    setDialog(null);
    setError("");
  };

  async function toggleBarcode(b: Barcode) {
    if (b.active && !confirm(`Deactivate barcode ${b.code}? It will stop scanning and can never be given to another item.`)) return;
    try {
      saved(await api<Product>(`/barcodes/${b.id}`, { method: "PATCH", body: { active: !b.active } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update barcode");
    }
  }

  const kit = product.variants.find((v) => v.kind === "KIT");
  const boxes = product.variants.filter((v) => v.kind === "COMPONENT");
  const standard = product.variants.filter((v) => v.kind === "STANDARD");
  const boxQty = (boxId: string) => kit?.components.find((c) => c.componentVariant.id === boxId)?.quantity;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/products" className="mb-4 inline-block text-sm text-brand">
        ← Products
      </Link>

      {justCreated && canPrint && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-ok/30 bg-ok/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ok">Product created. Print barcode labels to stick on the {kit ? "boxes" : "items"}.</p>
          <Button onClick={() => setDialog({ kind: "labels" })}>Print labels</Button>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <Thumb src={product.images[0]} size="size-20" />
          <div>
            <h1 className="text-2xl font-semibold text-ink">{product.name}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="brand">{kit ? `Multi-box kit · ${boxes.length} boxes` : "Single item"}</Badge>
              {product.status === "INACTIVE" ? <Badge tone="muted">Inactive</Badge> : <Badge tone="ok">Active</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPrint && (
            <Button variant="secondary" onClick={() => setDialog({ kind: "labels" })}>
              Print labels
            </Button>
          )}
          {canEdit && <Button onClick={() => setDialog({ kind: "info" })}>Edit details</Button>}
        </div>
      </div>

      {/* Details */}
      <dl className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-line bg-white p-5 text-sm sm:grid-cols-4">
        <Detail label="Category" value={product.category?.name} />
        <Detail label="Brand" value={product.brand} />
        <Detail label="VAT" value={product.taxRate ? `${product.taxRate.name} (${Number(product.taxRate.rate)}%)` : "Not set"} />
        <Detail label="Minimum stock" value={String(product.minStock)} />
        {product.description && (
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-muted">Description</dt>
            <dd className="mt-1 whitespace-pre-line text-ink">{product.description}</dd>
          </div>
        )}
      </dl>

      {product.images.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-3">
          {product.images.map((src) => (
            <Thumb key={src} src={src} size="size-24" />
          ))}
        </div>
      )}

      {kit ? (
        <>
          <section className="mb-6 rounded-xl border border-line bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-semibold text-ink">Complete kit</h2>
                <p className="mt-1 text-sm text-muted">
                  One kit = {kit.components.map((c) => `${c.quantity} × ${c.componentVariant.name.split(" – ")[0]}`).join(" + ")}
                </p>
              </div>
              {canEdit && (
                <Button variant="secondary" onClick={() => setDialog({ kind: "editVariant", variant: kit })}>
                  Edit price
                </Button>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Detail label="Selling price" value={money(kit.price)} />
              {kit.costPrice !== undefined && <Detail label="Cost price" value={money(kit.costPrice)} />}
              <Detail label="SKU" value={kit.sku} mono />
              <Detail label="System code" value={kit.code} mono />
            </dl>
          </section>

          <ItemList
            title="Boxes"
            hint="Each box has its own label. All boxes must be scanned before a kit is complete."
            items={boxes}
            extra={(v) => `${boxQty(v.id) ?? "?"} per kit`}
            money={money}
            canEdit={canEdit}
            onEdit={(v) => setDialog({ kind: "editVariant", variant: v })}
            onAddBarcode={(v) => setDialog({ kind: "addBarcode", variant: v })}
            onToggleBarcode={toggleBarcode}
            addLabel={boxes.length < 26 ? `+ Add Box ${String.fromCharCode(65 + boxes.length)}` : undefined}
            onAdd={() => setDialog({ kind: "addBox" })}
          />
        </>
      ) : (
        <ItemList
          title={standard.length > 1 ? "Variants" : "Price & codes"}
          items={standard}
          money={money}
          canEdit={canEdit}
          onEdit={(v) => setDialog({ kind: "editVariant", variant: v })}
          onAddBarcode={(v) => setDialog({ kind: "addBarcode", variant: v })}
          onToggleBarcode={toggleBarcode}
          addLabel="+ Add colour / size"
          onAdd={() => setDialog({ kind: "addVariant" })}
        />
      )}

      <div className="mt-6">
        {canMoveStock && (
          <div className="mb-3 flex flex-wrap gap-2">
            {(["add", "remove", "move"] as const).map((tab) => (
              <Link
                key={tab}
                href={`/stock?tab=${tab}&product=${product.id}`}
                className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-surface"
              >
                {tab === "add" ? "+ Add stock" : tab === "remove" ? "Remove stock" : "Move stock"}
              </Link>
            ))}
          </div>
        )}
        <ProductStockPanel productId={product.id} />
      </div>

      <section className="mt-6">
        <h2 className="mb-3 font-semibold text-ink">Stock history</h2>
        <MovementList filter={{ productId: product.id }} showProduct={false} />
      </section>

      <Modal title="Edit details" open={dialog?.kind === "info"} onClose={() => setDialog(null)}>
        <EditInfoForm product={product} onSaved={saved} />
      </Modal>
      <Modal title="Print barcode labels" open={dialog?.kind === "labels"} onClose={() => setDialog(null)}>
        <PrintLabelsForm product={product} onDone={() => setDialog(null)} />
      </Modal>
      <Modal title="Add colour / size" open={dialog?.kind === "addVariant"} onClose={() => setDialog(null)}>
        <AddVariantForm productId={product.id} onSaved={saved} />
      </Modal>
      <Modal title="Add box" open={dialog?.kind === "addBox"} onClose={() => setDialog(null)}>
        <AddBoxForm productId={product.id} nextLetter={String.fromCharCode(65 + boxes.length)} onSaved={saved} />
      </Modal>
      <Modal
        title={dialog?.kind === "editVariant" ? `Edit ${dialog.variant.kind === "KIT" ? "kit price" : dialog.variant.name}` : ""}
        open={dialog?.kind === "editVariant"}
        onClose={() => setDialog(null)}
      >
        {dialog?.kind === "editVariant" && (
          <EditVariantForm
            variant={dialog.variant}
            boxQuantity={boxQty(dialog.variant.id)}
            showCost={canEdit}
            onSaved={saved}
          />
        )}
      </Modal>
      <Modal title="Add supplier barcode" open={dialog?.kind === "addBarcode"} onClose={() => setDialog(null)}>
        {dialog?.kind === "addBarcode" && <AddBarcodeForm variant={dialog.variant} onSaved={saved} />}
      </Modal>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className={`mt-1 break-all text-ink ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</dd>
    </div>
  );
}

function ItemList({
  title,
  hint,
  items,
  extra,
  money,
  canEdit,
  onEdit,
  onAddBarcode,
  onToggleBarcode,
  addLabel,
  onAdd,
}: {
  title: string;
  hint?: string;
  items: Variant[];
  extra?: (v: Variant) => string;
  money: (v: string | null | undefined) => string;
  canEdit: boolean;
  onEdit: (v: Variant) => void;
  onAddBarcode: (v: Variant) => void;
  onToggleBarcode: (b: Barcode) => void;
  addLabel?: string;
  onAdd: () => void;
}) {
  return (
    <section className="rounded-xl border border-line bg-white">
      <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-ink">{title}</h2>
          {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
        </div>
        {canEdit && addLabel && (
          <Button variant="secondary" onClick={onAdd}>
            {addLabel}
          </Button>
        )}
      </div>
      <ul className="divide-y divide-line">
        {items.map((v) => (
          <li key={v.id} className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-medium ${v.active ? "text-ink" : "text-muted line-through"}`}>{v.name}</span>
                  {extra && <Badge>{extra(v)}</Badge>}
                  {!v.active && <Badge tone="muted">Inactive</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted">
                  SKU <span className="font-mono text-ink">{v.sku}</span>
                  {v.kind === "STANDARD" && (
                    <>
                      {" · "}
                      <span className="font-semibold text-ink">{money(v.price)}</span>
                      {v.costPrice !== undefined && <> · cost {money(v.costPrice)}</>}
                    </>
                  )}
                </p>
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => onEdit(v)}>
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => onAddBarcode(v)}>
                    + Barcode
                  </Button>
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {v.barcodes.map((b) => (
                <span
                  key={b.id}
                  className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 font-mono text-xs ${
                    b.active ? "border-line bg-surface text-ink" : "border-dashed border-line text-muted line-through"
                  }`}
                  title={b.type === "INTERNAL" ? "System barcode (printed on labels)" : "Supplier barcode"}
                >
                  {b.code}
                  <span className="font-sans text-[10px] uppercase text-muted">{b.type === "INTERNAL" ? "label" : "supplier"}</span>
                  {canEdit && (
                    <button type="button" onClick={() => onToggleBarcode(b)} className="font-sans text-[11px] text-brand hover:underline">
                      {b.active ? "deactivate" : "reactivate"}
                    </button>
                  )}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
