"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ImageUploader } from "@/components/image-uploader";
import { Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import type { Category, ProductStatus, TaxRate } from "@/lib/types";

export interface ProductInfo {
  name: string;
  description: string;
  categoryId: string;
  brand: string;
  taxRateId: string;
  minStock: string;
  status: ProductStatus;
  images: string[];
}

export function useCatalogOptions() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  useEffect(() => {
    api<Category[]>("/categories").then(setCategories).catch(() => setCategories([]));
    api<TaxRate[]>("/tax-rates").then(setTaxRates).catch(() => setTaxRates([]));
  }, []);
  return { categories, taxRates };
}

/** Fields shared by "Add product" and "Edit product". */
export function ProductInfoFields({
  value,
  onChange,
  categories,
  taxRates,
}: {
  value: ProductInfo;
  onChange: (v: ProductInfo) => void;
  categories: Category[];
  taxRates: TaxRate[];
}) {
  const set = <K extends keyof ProductInfo>(key: K, v: ProductInfo[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-4">
      <Field label="Product name">
        {(id) => <Input id={id} value={value.name} onChange={(e) => set("name", e.target.value)} required maxLength={150} placeholder="Wooden Chair" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          {(id) => (
            <Select id={id} value={value.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Brand">
          {(id) => <Input id={id} value={value.brand} onChange={(e) => set("brand", e.target.value)} maxLength={80} />}
        </Field>
        <Field label="VAT rate">
          {(id) =>
            taxRates.length === 0 ? (
              <p id={id} className="flex min-h-11 items-center text-sm text-muted">
                No VAT rates yet —&nbsp;
                <Link href="/settings" className="text-brand underline">
                  add them in Settings
                </Link>
              </p>
            ) : (
              <Select id={id} value={value.taxRateId} onChange={(e) => set("taxRateId", e.target.value)}>
                <option value="">Default</option>
                {taxRates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({Number(t.rate)}%)
                  </option>
                ))}
              </Select>
            )
          }
        </Field>
        <Field label="Minimum stock" hint="Warn when stock of an item drops below this">
          {(id) => <Input id={id} type="number" min={0} inputMode="numeric" value={value.minStock} onChange={(e) => set("minStock", e.target.value)} />}
        </Field>
      </div>
      <Field label="Description">
        {(id) => (
          <textarea
            id={id}
            rows={3}
            maxLength={5000}
            value={value.description}
            onChange={(e) => set("description", e.target.value)}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 sm:text-sm"
          />
        )}
      </Field>
      <Field label="Status">
        {(id) => (
          <Select id={id} value={value.status} onChange={(e) => set("status", e.target.value as ProductStatus)}>
            <option value="ACTIVE">Active — can be stocked and sold</option>
            <option value="INACTIVE">Inactive — hidden from sale</option>
          </Select>
        )}
      </Field>
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Photos</p>
        <ImageUploader images={value.images} onChange={(images) => set("images", images)} />
      </div>
    </div>
  );
}

export function infoPayload(v: ProductInfo) {
  return {
    name: v.name.trim(),
    description: v.description.trim() || undefined,
    categoryId: v.categoryId || undefined,
    brand: v.brand.trim() || undefined,
    taxRateId: v.taxRateId || undefined,
    minStock: v.minStock === "" ? 0 : Number(v.minStock),
    status: v.status,
    images: v.images,
  };
}
