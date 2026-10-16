import { Injectable } from '@nestjs/common';
import { LocationType, MovementType, ProductType, VariantKind } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CODE_PREFIX, LOCATION_PREFIX, variantName } from '../catalog/codes.js';
import { ProductsService } from '../catalog/products.service.js';
import { LocationsService } from '../locations/locations.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MoveInput, StockService } from '../stock/stock.service.js';
import { parseNumber, readSheet, SheetRow } from './sheet.js';

export interface RowResult {
  row: number;
  ok: boolean;
  /** What will happen / happened, e.g. "New product, 2 variants". */
  summary: string;
  errors: string[];
}

export interface ImportResult {
  rows: RowResult[];
  okCount: number;
  errorCount: number;
  committed: boolean;
  /** Filled after a commit. */
  created?: number;
}

export const PRODUCT_COLUMNS = {
  name: ['Product name'],
  color: ['Colour', 'Color'],
  size: ['Size'],
  sku: ['SKU'],
  barcode: ['Supplier barcode', 'Barcode'],
  category: ['Category'],
  brand: ['Brand'],
  price: ['Price', 'Selling price'],
  cost: ['Cost price', 'Cost'],
  vat: ['VAT rate', 'VAT'],
  minStock: ['Minimum stock', 'Min stock'],
  description: ['Description'],
};

export const STOCK_COLUMNS = {
  item: ['SKU or barcode', 'SKU', 'Barcode', 'Code'],
  location: ['Location', 'Location code', 'Location code or path'],
  quantity: ['Quantity', 'Qty'],
  note: ['Note'],
};

const RESERVED = new RegExp(`^(${CODE_PREFIX}|${LOCATION_PREFIX})-\\d`, 'i');
const SYSTEM: LocationType[] = [LocationType.TRANSIT, LocationType.DAMAGED];
const key = (s: string) => s.trim().toLowerCase();

/**
 * Bulk import from Excel/CSV. Every call first checks every row; with `commit` it then saves.
 * Products: rows with the same product name become one product with several colours/sizes.
 * Opening stock: one STOCK_IN per row, all in one transaction (all rows or none).
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly stock: StockService,
    private readonly locations: LocationsService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- products

  async importProducts(user: AuthUser, file: Buffer, commit: boolean): Promise<ImportResult> {
    const rows = await readSheet(file, PRODUCT_COLUMNS);
    const [categories, rates, existingProducts] = await Promise.all([
      this.prisma.category.findMany({ select: { id: true, name: true } }),
      this.prisma.taxRate.findMany({ where: { active: true }, select: { id: true, name: true, rate: true } }),
      this.prisma.product.findMany({ select: { name: true } }),
    ]);
    const categoryByName = new Map(categories.map((c) => [key(c.name), c.id]));
    const existingNames = new Set(existingProducts.map((p) => key(p.name)));

    // Codes already used anywhere (SKUs and barcodes are unique system-wide).
    const skus = rows.map((r) => r.values.sku).filter(Boolean);
    const barcodes = rows.map((r) => r.values.barcode).filter(Boolean);
    const [takenSkus, takenBarcodes] = await Promise.all([
      this.prisma.productVariant.findMany({ where: { sku: { in: skus, mode: 'insensitive' } }, select: { sku: true } }),
      this.prisma.barcode.findMany({ where: { code: { in: barcodes } }, select: { code: true } }),
    ]);
    const skuTaken = new Set(takenSkus.map((s) => key(s.sku)));
    const barcodeTaken = new Set(takenBarcodes.map((b) => b.code));
    const seenSku = new Map<string, number>();
    const seenBarcode = new Map<string, number>();

    // Group rows into products.
    const groups = new Map<string, SheetRow[]>();
    for (const r of rows) {
      const name = r.values.name?.trim();
      const k = name ? key(name) : `__missing_${r.row}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }

    const results = new Map<number, RowResult>();
    const plans: { rows: SheetRow[]; dto: Parameters<ProductsService['create']>[1]; newCategory?: string }[] = [];

    for (const [k, group] of groups) {
      const first = group[0].values;
      const groupErrors: string[] = [];
      if (k.startsWith('__missing_')) groupErrors.push('Product name is required');
      else if (existingNames.has(k)) groupErrors.push(`A product called "${first.name}" already exists`);

      let taxRateId: string | undefined;
      if (first.vat) {
        const pct = parseNumber(first.vat.replace('%', ''));
        const rate = rates.find((t) => key(t.name) === key(first.vat)) ?? (pct !== null && !Number.isNaN(pct) ? rates.find((t) => Number(t.rate) === pct) : undefined);
        if (!rate) groupErrors.push(`VAT rate "${first.vat}" not found (add it under Settings first)`);
        else taxRateId = rate.id;
      }
      const minStock = parseNumber(first.minStock);
      if (minStock !== null && (Number.isNaN(minStock) || minStock < 0 || !Number.isInteger(minStock))) groupErrors.push('Minimum stock must be a whole number');

      const variantNames = new Set<string>();
      const variants = group.map((r) => {
        const v = r.values;
        const errors: string[] = [];
        const price = parseNumber(v.price);
        const cost = parseNumber(v.cost);
        if (price === null) errors.push('Price is required');
        else if (Number.isNaN(price) || price < 0) errors.push(`Price "${v.price}" is not a valid amount`);
        if (cost !== null && (Number.isNaN(cost) || cost < 0)) errors.push(`Cost price "${v.cost}" is not a valid amount`);
        for (const [label, code, taken, seen] of [
          ['SKU', v.sku, skuTaken, seenSku],
          ['Barcode', v.barcode, barcodeTaken, seenBarcode],
        ] as const) {
          if (!code) continue;
          const c = label === 'SKU' ? key(code) : code;
          if (RESERVED.test(code)) errors.push(`${label} "${code}" looks like a system code — leave it empty and one is generated`);
          if (taken.has(c)) errors.push(`${label} "${code}" is already used by another item`);
          if (seen.has(c)) errors.push(`${label} "${code}" also appears on row ${seen.get(c)}`);
          seen.set(c, r.row);
        }
        const vName = variantName(v.color, v.size).toLowerCase();
        if (variantNames.has(vName)) errors.push(`Two rows have the same colour/size for "${first.name}"`);
        variantNames.add(vName);
        results.set(r.row, { row: r.row, ok: false, summary: '', errors });
        return { sku: v.sku || undefined, color: v.color || undefined, size: v.size || undefined, price: price ?? 0, costPrice: cost ?? undefined, barcode: v.barcode || undefined };
      });

      const newCategory = first.category && !categoryByName.has(key(first.category)) ? first.category.trim() : undefined;
      const groupOk = !groupErrors.length && group.every((r) => !results.get(r.row)!.errors.length);
      group.forEach((r, i) => {
        const res = results.get(r.row)!;
        res.errors.unshift(...(i === 0 ? groupErrors : groupErrors.length ? ['See the first row of this product'] : []));
        res.ok = groupOk;
        res.summary =
          i === 0
            ? `New product "${first.name}"${group.length > 1 ? ` with ${group.length} variants` : ''}${newCategory ? ` · new category "${newCategory}"` : ''}`
            : `Variant of "${first.name}" (${variantName(r.values.color, r.values.size)})`;
      });
      if (groupOk) {
        plans.push({
          rows: group,
          newCategory,
          dto: {
            name: first.name.trim(),
            type: ProductType.STANDARD,
            brand: first.brand || undefined,
            description: first.description || undefined,
            minStock: minStock ?? undefined,
            taxRateId,
            categoryId: first.category ? categoryByName.get(key(first.category)) : undefined,
            variants,
          },
        });
      }
    }

    const ordered = rows.map((r) => results.get(r.row)!);
    const result: ImportResult = { rows: ordered, okCount: ordered.filter((r) => r.ok).length, errorCount: ordered.filter((r) => !r.ok).length, committed: false };
    if (!commit) return result;
    if (result.errorCount) return result; // nothing is saved while any row has a problem

    let created = 0;
    for (const plan of plans) {
      try {
        if (plan.newCategory && !categoryByName.has(key(plan.newCategory))) {
          const c = await this.prisma.category.create({ data: { name: plan.newCategory } });
          categoryByName.set(key(c.name), c.id);
        }
        if (plan.newCategory) plan.dto.categoryId = categoryByName.get(key(plan.newCategory));
        await this.products.create(user.id, plan.dto);
        created++;
      } catch (e) {
        // Should be rare (checked above) — e.g. someone created the same SKU meanwhile.
        for (const r of plan.rows) {
          const res = results.get(r.row)!;
          res.ok = false;
          res.errors.push(`Not imported: ${(e as Error).message}`);
        }
      }
    }
    await this.audit.log({ userId: user.id, action: 'PRODUCTS_IMPORTED', entity: 'Product', data: { products: created, rows: rows.length } });
    return { rows: ordered, okCount: ordered.filter((r) => r.ok).length, errorCount: ordered.filter((r) => !r.ok).length, committed: true, created };
  }

  // ---------------------------------------------------------------- opening stock

  async importOpeningStock(user: AuthUser, file: Buffer, commit: boolean): Promise<ImportResult> {
    const rows = await readSheet(file, STOCK_COLUMNS);
    const all = await this.locations.withPaths();
    const parents = new Set(all.filter((l) => l.active && l.parentId).map((l) => l.parentId));
    const byCode = new Map(all.map((l) => [l.code.toUpperCase(), l]));
    const byPath = new Map(all.map((l) => [key(l.path.replace(/\s*›\s*/g, '>')), l]));

    const codes = rows.map((r) => r.values.item).filter(Boolean);
    const [variants, barcodes] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: { OR: [{ sku: { in: codes, mode: 'insensitive' } }, { code: { in: codes.map((c) => c.toUpperCase()) } }] },
        select: { id: true, sku: true, code: true, kind: true, name: true, product: { select: { name: true } } },
      }),
      this.prisma.barcode.findMany({
        where: { code: { in: codes }, active: true },
        select: { code: true, variant: { select: { id: true, sku: true, code: true, kind: true, name: true, product: { select: { name: true } } } } },
      }),
    ]);
    const findVariant = (c: string) =>
      variants.find((v) => key(v.sku) === key(c) || v.code === c.toUpperCase()) ?? barcodes.find((b) => b.code === c)?.variant;

    const moves: MoveInput[] = [];
    const results: RowResult[] = rows.map((r) => {
      const v = r.values;
      const errors: string[] = [];
      const variant = v.item ? findVariant(v.item) : undefined;
      if (!v.item) errors.push('SKU or barcode is required');
      else if (!variant) errors.push(`No item with SKU/barcode "${v.item}"`);
      else if (variant.kind === VariantKind.KIT) errors.push(`"${v.item}" is a whole kit — enter stock for each box`);

      const loc = v.location ? (byCode.get(v.location.toUpperCase()) ?? byPath.get(key(v.location.replace(/\s*[›>]\s*/g, '>')))) : undefined;
      if (!v.location) errors.push('Location is required');
      else if (!loc) errors.push(`Location "${v.location}" not found (use its label code, e.g. LOC-000012, or its full path)`);
      else if (!loc.active || SYSTEM.includes(loc.type)) errors.push(`${loc.path} can't hold stock`);
      else if (parents.has(loc.id)) errors.push(`${loc.path} has spaces inside — use the exact space`);

      const qty = parseNumber(v.quantity);
      if (qty === null) errors.push('Quantity is required');
      else if (Number.isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) errors.push(`Quantity "${v.quantity}" must be a whole number above 0`);

      const ok = !errors.length;
      if (ok) {
        moves.push({ type: MovementType.STOCK_IN, variantId: variant!.id, quantity: qty!, toLocationId: loc!.id, reason: 'Opening stock', note: v.note || 'Imported', reference: `IMPORT-${new Date().toISOString().slice(0, 10)}` });
      }
      const name = variant ? `${variant.product.name}${variant.name !== 'Default' ? ` – ${variant.name}` : ''}` : v.item;
      return { row: r.row, ok, summary: ok ? `${qty} × ${name} → ${loc!.path}` : '', errors };
    });

    const result: ImportResult = { rows: results, okCount: results.filter((r) => r.ok).length, errorCount: results.filter((r) => !r.ok).length, committed: false };
    if (!commit || result.errorCount) return result;

    await this.stock.apply(user.id, moves);
    await this.audit.log({ userId: user.id, action: 'STOCK_IMPORTED', entity: 'StockMovement', data: { rows: moves.length, units: moves.reduce((s, m) => s + m.quantity, 0) } });
    return { ...result, committed: true, created: moves.length };
  }
}
