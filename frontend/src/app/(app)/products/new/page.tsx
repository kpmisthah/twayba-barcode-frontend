"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import type { Product, ProductType } from "@/lib/types";
import { infoPayload, ProductInfoFields, useCatalogOptions, type ProductInfo } from "../product-info-fields";

interface VariantRow {
  color: string;
  size: string;
  price: string;
  costPrice: string;
  sku: string;
  barcode: string;
}

interface BoxRow {
  label: string;
  quantity: string;
  sku: string;
  barcode: string;
}

const emptyVariant = (): VariantRow => ({ color: "", size: "", price: "", costPrice: "", sku: "", barcode: "" });
const emptyBox = (): BoxRow => ({ label: "", quantity: "1", sku: "", barcode: "" });
const letter = (i: number) => String.fromCharCode(65 + i);

export default function NewProductPage() {
  const router = useRouter();
  const { categories, taxRates } = useCatalogOptions();
  const [info, setInfo] = useState<ProductInfo>({
    name: "",
    description: "",
    categoryId: "",
    brand: "",
    taxRateId: "",
    minStock: "",
    status: "ACTIVE",
    images: [],
  });
  const [type, setType] = useState<ProductType>("STANDARD");
  const [hasVariants, setHasVariants] = useState(false);
  const [single, setSingle] = useState<VariantRow>(emptyVariant());
  const [variants, setVariants] = useState<VariantRow[]>([emptyVariant(), emptyVariant()]);
  const [kit, setKit] = useState({ price: "", costPrice: "", sku: "" });
  const [boxes, setBoxes] = useState<BoxRow[]>([emptyBox(), emptyBox(), emptyBox()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const body =
        type === "KIT"
          ? {
              ...infoPayload(info),
              type,
              kit: {
                price: Number(kit.price),
                costPrice: optionalNumber(kit.costPrice),
                sku: kit.sku.trim() || undefined,
                components: boxes.map((b) => ({
                  label: b.label.trim() || undefined,
                  quantity: Number(b.quantity),
                  sku: b.sku.trim() || undefined,
                  barcode: b.barcode.trim() || undefined,
                })),
              },
            }
          : { ...infoPayload(info), type, variants: (hasVariants ? variants : [single]).map(variantPayload) };
      const product = await api<Product>("/products", { method: "POST", body });
      router.replace(`/products/${product.id}?created=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create product");
      window.scrollTo({ top: 0, behavior: "smooth" });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-3xl">
      <PageHeader title="Add product" description="Codes and barcodes are created automatically when you save." />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <Section title="Product details">
        <ProductInfoFields value={info} onChange={setInfo} categories={categories} taxRates={taxRates} />
      </Section>

      <Section title="How is it packed?">
        <div className="grid gap-3 sm:grid-cols-2">
          <TypeOption
            checked={type === "STANDARD"}
            onSelect={() => setType("STANDARD")}
            title="Single item"
            text="One piece or one box per item — a chair, a CCTV camera."
          />
          <TypeOption
            checked={type === "KIT"}
            onSelect={() => setType("KIT")}
            title="Multi-box kit"
            text="One product delivered in several boxes — e.g. a shelf in Box A, B and C."
          />
        </div>
      </Section>

      {type === "STANDARD" ? (
        <Section title="Price & codes">
          <label className="mb-4 flex min-h-11 items-center gap-3 text-sm text-ink">
            <input type="checkbox" className="size-5" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} />
            This product comes in different colours or sizes
          </label>

          {!hasVariants ? (
            <VariantFields row={single} onChange={setSingle} showOptions={false} />
          ) : (
            <div className="flex flex-col gap-4">
              {variants.map((row, i) => (
                <div key={i} className="rounded-lg border border-line p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">Variant {i + 1}</span>
                    {variants.length > 1 && (
                      <Button type="button" variant="ghost" onClick={() => setVariants(variants.filter((_, j) => j !== i))}>
                        Remove
                      </Button>
                    )}
                  </div>
                  <VariantFields row={row} onChange={(r) => setVariants(variants.map((v, j) => (j === i ? r : v)))} showOptions />
                </div>
              ))}
              <Button type="button" variant="secondary" className="self-start" onClick={() => setVariants([...variants, emptyVariant()])}>
                + Add variant
              </Button>
            </div>
          )}
        </Section>
      ) : (
        <>
          <Section title="Kit price" hint="The customer pays for the complete kit. Boxes have no price of their own.">
            <div className="grid gap-4 sm:grid-cols-3">
              <MoneyField label="Selling price" value={kit.price} onChange={(price) => setKit({ ...kit, price })} required />
              <MoneyField label="Cost price" value={kit.costPrice} onChange={(costPrice) => setKit({ ...kit, costPrice })} />
              <Field label="SKU" hint="Leave empty to use the system code">
                {(id) => <Input id={id} value={kit.sku} onChange={(e) => setKit({ ...kit, sku: e.target.value })} />}
              </Field>
            </div>
          </Section>

          <Section
            title="Boxes"
            hint="Each box type gets its own barcode label. The driver must scan every box before the kit counts as complete."
          >
            <div className="flex flex-col gap-4">
              {boxes.map((box, i) => (
                <div key={i} className="rounded-lg border border-line p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">Box {letter(i)}</span>
                    {boxes.length > 1 && i === boxes.length - 1 && (
                      <Button type="button" variant="ghost" onClick={() => setBoxes(boxes.slice(0, -1))}>
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                    <Field label="What's inside (optional)">
                      {(id) => (
                        <Input id={id} value={box.label} placeholder="Side panels" onChange={(e) => setBoxes(boxes.map((b, j) => (j === i ? { ...b, label: e.target.value } : b)))} />
                      )}
                    </Field>
                    <Field label="Boxes per kit">
                      {(id) => (
                        <Input
                          id={id}
                          type="number"
                          min={1}
                          max={99}
                          inputMode="numeric"
                          value={box.quantity}
                          required
                          onChange={(e) => setBoxes(boxes.map((b, j) => (j === i ? { ...b, quantity: e.target.value } : b)))}
                        />
                      )}
                    </Field>
                    <Field label="SKU (optional)">
                      {(id) => <Input id={id} value={box.sku} onChange={(e) => setBoxes(boxes.map((b, j) => (j === i ? { ...b, sku: e.target.value } : b)))} />}
                    </Field>
                    <div className="sm:col-span-1" />
                    <Field label="Supplier barcode (optional)" hint="Only if this box already has its own barcode">
                      {(id) => (
                        <Input id={id} value={box.barcode} onChange={(e) => setBoxes(boxes.map((b, j) => (j === i ? { ...b, barcode: e.target.value } : b)))} />
                      )}
                    </Field>
                  </div>
                </div>
              ))}
              {boxes.length < 26 && (
                <Button type="button" variant="secondary" className="self-start" onClick={() => setBoxes([...boxes, emptyBox()])}>
                  + Add box {letter(boxes.length)}
                </Button>
              )}
              <p className="text-sm text-muted">
                One kit = {boxes.map((b, i) => `${b.quantity || "?"} × Box ${letter(i)}`).join(" + ")}
              </p>
            </div>
          </Section>
        </>
      )}

      <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-line bg-page/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
        <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
          {saving ? "Saving…" : "Save product"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-line bg-white p-5">
      <h2 className="font-semibold text-ink">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function TypeOption({ checked, onSelect, title, text }: { checked: boolean; onSelect: () => void; title: string; text: string }) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${checked ? "border-brand bg-brand/5" : "border-line"}`}>
      <input type="radio" name="type" className="mt-0.5 size-5" checked={checked} onChange={onSelect} />
      <span>
        <span className="block font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{text}</span>
      </span>
    </label>
  );
}

function MoneyField({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <Field label={label}>
      {(id) => <Input id={id} type="number" min={0} step="0.01" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} required={required} />}
    </Field>
  );
}

function VariantFields({ row, onChange, showOptions }: { row: VariantRow; onChange: (r: VariantRow) => void; showOptions: boolean }) {
  const set = (key: keyof VariantRow) => (v: string) => onChange({ ...row, [key]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {showOptions && (
        <>
          <Field label="Colour">{(id) => <Input id={id} value={row.color} onChange={(e) => set("color")(e.target.value)} placeholder="Black" />}</Field>
          <Field label="Size">{(id) => <Input id={id} value={row.size} onChange={(e) => set("size")(e.target.value)} placeholder="Large" />}</Field>
        </>
      )}
      <MoneyField label="Selling price" value={row.price} onChange={set("price")} required />
      <MoneyField label="Cost price" value={row.costPrice} onChange={set("costPrice")} />
      <Field label="SKU (optional)" hint="Leave empty to use the system code">
        {(id) => <Input id={id} value={row.sku} onChange={(e) => set("sku")(e.target.value)} />}
      </Field>
      <Field label="Supplier barcode (optional)" hint="Only if the item already has a barcode">
        {(id) => <Input id={id} value={row.barcode} onChange={(e) => set("barcode")(e.target.value)} />}
      </Field>
    </div>
  );
}

function optionalNumber(v: string) {
  return v.trim() === "" ? undefined : Number(v);
}

function variantPayload(r: VariantRow) {
  return {
    color: r.color.trim() || undefined,
    size: r.size.trim() || undefined,
    price: Number(r.price),
    costPrice: optionalNumber(r.costPrice),
    sku: r.sku.trim() || undefined,
    barcode: r.barcode.trim() || undefined,
  };
}
