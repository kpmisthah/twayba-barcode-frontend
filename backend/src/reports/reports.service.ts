import { Injectable, NotFoundException } from '@nestjs/common';
import { LocationType, MovementType, OrderStatus, Prisma, ProductStatus, Role, StocktakeStatus, VariantKind } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types.js';
import { withDescendants } from '../locations/location-tree.js';
import { LocationsService, LocationWithPath } from '../locations/locations.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PAYMENT_LABELS } from '../sales/documents.service.js';
import { kitAvailability } from '../stock/kit-math.js';
import { MOVEMENT_LABELS } from '../stock/movement-rules.js';
import { StockQueryService } from '../stock/stock-query.service.js';
import { Column, REPORTS, ReportFilters, ReportResult, Row } from './catalog.js';
import { dayRange, maltaDay } from './dates.js';

export const MAX_ROWS = 10_000;
const SYSTEM: LocationType[] = [LocationType.TRANSIT, LocationType.DAMAGED];
const COST_ROLES: Role[] = [Role.ADMIN, Role.MANAGER];

type VariantName = { kind: VariantKind; name: string; product: { name: string } };
const itemName = (v: VariantName) =>
  v.kind === VariantKind.STANDARD && v.name !== 'Default' ? `${v.product.name} – ${v.name}` : v.kind === VariantKind.COMPONENT ? `${v.product.name}, ${v.name.split(' – ')[0]}` : v.product.name;
const num = (v: Prisma.Decimal | number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

const ORDER_LABELS: Record<OrderStatus, string> = {
  NEW: 'New',
  ALLOCATED: 'Stock reserved',
  PICKING: 'Picking',
  LOADED: 'Loaded',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  FAILED: 'Delivery failed',
  RETURNED: 'Returned',
  CANCELLED: 'Cancelled',
};

/** Builds every report as columns + rows (shown on screen and exported to Excel). */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
    private readonly stockQuery: StockQueryService,
  ) {}

  async run(type: string, f: ReportFilters, user: AuthUser): Promise<ReportResult> {
    const info = REPORTS.find((r) => r.type === type);
    if (!info) throw new NotFoundException('Unknown report');
    const all = await this.locations.withPaths();
    const ctx: Ctx = { f, user, all, paths: new Map(all.map((l) => [l.id, l])), created: dayRange(f.from, f.to) };
    const builders: Record<string, (c: Ctx) => Promise<Built>> = {
      sales: (c) => this.sales(c),
      'sales-by-day': (c) => this.salesByDay(c),
      'channel-summary': (c) => this.channelSummary(c),
      'in-transit': (c) => this.inTransit(c),
      'sales-by-cashier': (c) => this.salesByCashier(c),
      'sales-by-product': (c) => this.salesByProduct(c),
      returns: (c) => this.returns(c),
      inventory: (c) => this.inventory(c),
      'stock-by-location': (c) => this.stockByLocation(c),
      'low-stock': (c) => this.lowStock(c),
      movements: (c) => this.movements(c),
      damaged: (c) => this.damaged(c),
      'stocktake-variance': (c) => this.stocktakeVariance(c),
      'incomplete-kits': (c) => this.incompleteKits(c),
      orders: (c) => this.orders(c),
      deliveries: (c) => this.deliveries(c),
      'picking-errors': (c) => this.pickingErrors(c),
      overrides: (c) => this.overrides(c),
    };
    const { columns, rows } = await builders[type](ctx);
    const truncated = rows.length > MAX_ROWS;
    const shown = truncated ? rows.slice(0, MAX_ROWS) : rows;
    const totalCols = columns.filter((c) => c.total);
    const totals = totalCols.length
      ? Object.fromEntries(totalCols.map((c) => [c.key, round2(shown.reduce((s, r) => s + (Number(r[c.key]) || 0), 0))]))
      : null;
    return { type, title: info.title, columns, rows: shown, totals, truncated, generatedAt: new Date().toISOString() };
  }

  // ---------------------------------------------------------------- sales

  private saleWhere(c: Ctx): Prisma.SaleWhereInput {
    const { f } = c;
    return {
      createdAt: c.created,
      ...(f.userId && { cashierId: f.userId }),
      ...(f.locationId && { siteId: { in: scopeIds(c) } }),
      ...((f.productId || f.categoryId) && {
        lines: { some: { variant: { product: { ...(f.productId && { id: f.productId }), ...(f.categoryId && { categoryId: f.categoryId }) } } } },
      }),
    };
  }

  private async sales(c: Ctx): Promise<Built> {
    const sales = await this.prisma.sale.findMany({
      where: this.saleWhere(c),
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS + 1,
      include: { cashier: { select: { name: true } }, site: { select: { name: true } }, payments: true, lines: { select: { quantity: true } }, approvedBy: { select: { name: true } } },
    });
    return {
      columns: [
        col('date', 'Date', 'datetime'),
        col('invoice', 'Invoice'),
        col('site', 'Shop'),
        col('cashier', 'Cashier'),
        col('customer', 'Customer'),
        col('items', 'Items', 'number', true),
        col('discount', 'Discount', 'money', true),
        col('net', 'Excl. VAT', 'money', true),
        col('vat', 'VAT', 'money', true),
        col('total', 'Total', 'money', true),
        col('payment', 'Paid by'),
        col('approvedBy', 'Discount approved by'),
      ],
      rows: sales.map((s) => ({
        date: iso(s.createdAt),
        invoice: s.invoiceNumber,
        site: s.site?.name ?? null,
        cashier: s.cashier.name,
        customer: [s.customerName, s.customerPhone].filter(Boolean).join(', ') || null,
        items: s.lines.reduce((n, l) => n + l.quantity, 0),
        discount: num(s.discountTotal),
        net: num(s.netTotal),
        vat: num(s.taxTotal),
        total: num(s.total),
        payment: s.payments.map((p) => `${PAYMENT_LABELS[p.method]} ${Number(p.amount).toFixed(2)}`).join(' + '),
        approvedBy: s.approvedBy?.name ?? null,
      })),
    };
  }

  private async salesByDay(c: Ctx): Promise<Built> {
    const [sales, notes] = await Promise.all([
      this.prisma.sale.findMany({ where: this.saleWhere(c), select: { createdAt: true, total: true, taxTotal: true } }),
      this.prisma.creditNote.findMany({
        where: { createdAt: c.created, ...(c.f.userId && { cashierId: c.f.userId }), ...(c.f.locationId && { sale: { siteId: { in: scopeIds(c) } } }) },
        select: { createdAt: true, total: true },
      }),
    ]);
    const days = new Map<string, { sales: number; total: number; vat: number; returns: number; refunded: number }>();
    const day = (d: Date) => {
      const key = maltaDay(d);
      const row = days.get(key) ?? { sales: 0, total: 0, vat: 0, returns: 0, refunded: 0 };
      days.set(key, row);
      return row;
    };
    for (const s of sales) {
      const r = day(s.createdAt);
      r.sales += 1;
      r.total += Number(s.total);
      r.vat += Number(s.taxTotal);
    }
    for (const n of notes) {
      const r = day(n.createdAt);
      r.returns += 1;
      r.refunded += Number(n.total);
    }
    return {
      columns: [
        col('day', 'Day', 'date'),
        col('sales', 'Sales', 'number', true),
        col('total', 'Takings', 'money', true),
        col('vat', 'VAT', 'money', true),
        col('returns', 'Returns', 'number', true),
        col('refunded', 'Refunded', 'money', true),
        col('net', 'Net', 'money', true),
      ],
      rows: [...days.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, r]) => ({ day: d, sales: r.sales, total: round2(r.total), vat: round2(r.vat), returns: r.returns, refunded: round2(r.refunded), net: round2(r.total - r.refunded) })),
    };
  }

  /** One row per day across all channels: shop (POS), website orders, manual orders, returns. */
  private async channelSummary(c: Ctx): Promise<Built> {
    const [sales, notes, orders] = await Promise.all([
      this.prisma.sale.findMany({ where: { createdAt: c.created }, select: { createdAt: true, total: true } }),
      this.prisma.creditNote.findMany({ where: { createdAt: c.created }, select: { createdAt: true, total: true } }),
      this.prisma.order.findMany({
        where: { status: OrderStatus.DELIVERED, deliveredAt: c.created },
        select: { deliveredAt: true, source: true, codAmount: true, paymentStatus: true, lines: { select: { quantity: true, unitPrice: true } } },
      }),
    ]);
    type Day = { pos: number; posTotal: number; web: number; webValue: number; manual: number; manualValue: number; returns: number; refunded: number };
    const days = new Map<string, Day>();
    const day = (d: Date) => {
      const k = maltaDay(d);
      const row = days.get(k) ?? { pos: 0, posTotal: 0, web: 0, webValue: 0, manual: 0, manualValue: 0, returns: 0, refunded: 0 };
      days.set(k, row);
      return row;
    };
    for (const s of sales) {
      const r = day(s.createdAt);
      r.pos += 1;
      r.posTotal += Number(s.total);
    }
    for (const n of notes) {
      const r = day(n.createdAt);
      r.returns += 1;
      r.refunded += Number(n.total);
    }
    for (const o of orders) {
      const r = day(o.deliveredAt!);
      // Value: website prices if sent, otherwise the cash-on-delivery amount.
      const priced = o.lines.every((l) => l.unitPrice !== null) ? o.lines.reduce((s, l) => s + Number(l.unitPrice) * l.quantity, 0) : Number(o.codAmount ?? 0);
      if (o.source === 'WEBSITE') {
        r.web += 1;
        r.webValue += priced;
      } else {
        r.manual += 1;
        r.manualValue += priced;
      }
    }
    return {
      columns: [
        col('day', 'Day', 'date'),
        col('pos', 'Shop sales', 'number', true),
        col('posTotal', 'Shop takings', 'money', true),
        col('web', 'Website orders delivered', 'number', true),
        col('webValue', 'Website value', 'money', true),
        col('manual', 'Other orders delivered', 'number', true),
        col('manualValue', 'Other orders value', 'money', true),
        col('returns', 'Returns', 'number', true),
        col('refunded', 'Refunded', 'money', true),
      ],
      rows: [...days.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, r]) => ({ day: d, pos: r.pos, posTotal: round2(r.posTotal), web: r.web, webValue: round2(r.webValue), manual: r.manual, manualValue: round2(r.manualValue), returns: r.returns, refunded: round2(r.refunded) })),
    };
  }

  private async salesByCashier(c: Ctx): Promise<Built> {
    const sales = await this.prisma.sale.findMany({
      where: this.saleWhere(c),
      select: { total: true, discountTotal: true, cashier: { select: { id: true, name: true } }, lines: { select: { quantity: true } } },
    });
    const by = new Map<string, { name: string; sales: number; items: number; discount: number; total: number }>();
    for (const s of sales) {
      const r = by.get(s.cashier.id) ?? { name: s.cashier.name, sales: 0, items: 0, discount: 0, total: 0 };
      r.sales += 1;
      r.items += s.lines.reduce((n, l) => n + l.quantity, 0);
      r.discount += Number(s.discountTotal);
      r.total += Number(s.total);
      by.set(s.cashier.id, r);
    }
    return {
      columns: [
        col('cashier', 'Cashier'),
        col('sales', 'Sales', 'number', true),
        col('items', 'Items', 'number', true),
        col('discount', 'Discounts given', 'money', true),
        col('total', 'Total sold', 'money', true),
        col('average', 'Average sale', 'money'),
      ],
      rows: [...by.values()]
        .sort((a, b) => b.total - a.total)
        .map((r) => ({ cashier: r.name, sales: r.sales, items: r.items, discount: round2(r.discount), total: round2(r.total), average: round2(r.total / r.sales) })),
    };
  }

  private async salesByProduct(c: Ctx): Promise<Built> {
    const { f } = c;
    const lines = await this.prisma.saleLine.findMany({
      where: {
        sale: this.saleWhere({ ...c, f: { ...f, productId: undefined, categoryId: undefined } }),
        ...((f.productId || f.categoryId) && { variant: { product: { ...(f.productId && { id: f.productId }), ...(f.categoryId && { categoryId: f.categoryId }) } } }),
      },
      select: {
        quantity: true,
        discountAmount: true,
        taxAmount: true,
        total: true,
        returnLines: { select: { quantity: true, total: true } },
        variant: { select: { id: true, code: true, kind: true, name: true, product: { select: { name: true, category: { select: { name: true } } } } } },
      },
    });
    const by = new Map<string, { item: string; code: string; category: string | null; qty: number; returned: number; discount: number; vat: number; total: number; refunded: number }>();
    for (const l of lines) {
      const v = l.variant;
      const r = by.get(v.id) ?? { item: itemName(v), code: v.code, category: v.product.category?.name ?? null, qty: 0, returned: 0, discount: 0, vat: 0, total: 0, refunded: 0 };
      r.qty += l.quantity;
      r.discount += Number(l.discountAmount);
      r.vat += Number(l.taxAmount);
      r.total += Number(l.total);
      for (const ret of l.returnLines) {
        r.returned += ret.quantity;
        r.refunded += Number(ret.total);
      }
      by.set(v.id, r);
    }
    return {
      columns: [
        col('item', 'Item'),
        col('code', 'Code'),
        col('category', 'Category'),
        col('qty', 'Sold', 'number', true),
        col('returned', 'Returned', 'number', true),
        col('discount', 'Discount', 'money', true),
        col('vat', 'VAT', 'money', true),
        col('total', 'Sold value', 'money', true),
        col('net', 'After returns', 'money', true),
      ],
      rows: [...by.values()]
        .sort((a, b) => b.total - a.total)
        .map((r) => ({
          item: r.item,
          code: r.code,
          category: r.category,
          qty: r.qty,
          returned: r.returned,
          discount: round2(r.discount),
          vat: round2(r.vat),
          total: round2(r.total),
          net: round2(r.total - r.refunded),
        })),
    };
  }

  private async returns(c: Ctx): Promise<Built> {
    const { f } = c;
    const lines = await this.prisma.creditNoteLine.findMany({
      where: {
        creditNote: { createdAt: c.created, ...(f.userId && { cashierId: f.userId }) },
        ...((f.productId || f.categoryId) && { saleLine: { variant: { product: { ...(f.productId && { id: f.productId }), ...(f.categoryId && { categoryId: f.categoryId }) } } } }),
      },
      orderBy: { creditNote: { createdAt: 'asc' } },
      take: MAX_ROWS + 1,
      include: {
        creditNote: { select: { creditNumber: true, createdAt: true, refundMethod: true, reason: true, cashier: { select: { name: true } }, sale: { select: { invoiceNumber: true } } } },
        saleLine: { select: { description: true, code: true } },
      },
    });
    return {
      columns: [
        col('date', 'Date', 'datetime'),
        col('creditNote', 'Credit note'),
        col('invoice', 'Invoice'),
        col('item', 'Item'),
        col('code', 'Code'),
        col('qty', 'Qty', 'number', true),
        col('condition', 'Condition'),
        col('backTo', 'Back to'),
        col('vat', 'VAT', 'money', true),
        col('refund', 'Refund', 'money', true),
        col('method', 'Refunded by'),
        col('by', 'Processed by'),
        col('reason', 'Reason'),
      ],
      rows: lines.map((l) => ({
        date: iso(l.creditNote.createdAt),
        creditNote: l.creditNote.creditNumber,
        invoice: l.creditNote.sale.invoiceNumber,
        item: l.saleLine.description,
        code: l.saleLine.code,
        qty: l.quantity,
        condition: l.condition === 'GOOD' ? 'Good' : 'Damaged',
        backTo: c.paths.get(l.locationId)?.path ?? null,
        vat: num(l.taxAmount),
        refund: num(l.total),
        method: PAYMENT_LABELS[l.creditNote.refundMethod],
        by: l.creditNote.cashier.name,
        reason: l.creditNote.reason,
      })),
    };
  }

  // ---------------------------------------------------------------- stock

  private variantFilter(c: Ctx): Prisma.ProductVariantWhereInput {
    const { f } = c;
    return {
      kind: { in: [VariantKind.STANDARD, VariantKind.COMPONENT] },
      product: { ...(f.productId && { id: f.productId }), ...(f.categoryId && { categoryId: f.categoryId }) },
    };
  }

  private async inventory(c: Ctx): Promise<Built> {
    const showCost = COST_ROLES.includes(c.user.role);
    const scope = c.f.locationId ? new Set(scopeIds(c)) : null;
    const { f } = c;
    const variants = await this.prisma.productVariant.findMany({
      where: {
        kind: { in: [VariantKind.STANDARD, VariantKind.COMPONENT] },
        product: { status: ProductStatus.ACTIVE, ...(f.productId && { id: f.productId }), ...(f.categoryId && { categoryId: f.categoryId }) },
      },
      include: {
        product: { select: { name: true, category: { select: { name: true } } } },
        stockLevels: { select: { locationId: true, onHand: true, reserved: true } },
      },
    });
    const rows: Row[] = [];
    for (const v of variants) {
      let store = 0;
      let reserved = 0;
      let transit = 0;
      let damaged = 0;
      for (const s of v.stockLevels) {
        const loc = c.paths.get(s.locationId);
        if (!loc) continue;
        if (loc.type === LocationType.TRANSIT) transit += s.onHand;
        else if (loc.type === LocationType.DAMAGED) damaged += s.onHand;
        else if (!scope || scope.has(s.locationId)) {
          store += s.onHand;
          reserved += s.reserved;
        }
      }
      if (scope && store === 0) continue;
      const cost = num(v.costPrice);
      rows.push({
        item: itemName(v),
        code: v.code,
        sku: v.sku,
        category: v.product.category?.name ?? null,
        store,
        reserved,
        available: store - reserved,
        transit: scope ? null : transit,
        damaged: scope ? null : damaged,
        ...(showCost && { cost, value: cost === null ? null : round2(cost * store) }),
      });
    }
    rows.sort((a, b) => String(a.item).localeCompare(String(b.item)));
    return {
      columns: [
        col('item', 'Item'),
        col('code', 'Code'),
        col('sku', 'SKU'),
        col('category', 'Category'),
        col('store', scope ? 'On hand here' : 'In store', 'number', true),
        col('reserved', 'Reserved', 'number', true),
        col('available', 'Available', 'number', true),
        ...(scope ? [] : [col('transit', 'In transit', 'number', true), col('damaged', 'Damaged', 'number', true)]),
        ...(showCost ? [col('cost', 'Cost price', 'money'), col('value', 'Stock value (cost)', 'money', true)] : []),
      ],
      rows,
    };
  }

  private async stockByLocation(c: Ctx): Promise<Built> {
    const ids = c.f.locationId ? scopeIds(c) : c.all.filter((l) => !SYSTEM.includes(l.type)).map((l) => l.id);
    const levels = await this.prisma.stockLevel.findMany({
      where: { locationId: { in: ids }, onHand: { gt: 0 }, variant: this.variantFilter(c) },
      include: { variant: { select: { code: true, kind: true, name: true, product: { select: { name: true } } } } },
    });
    const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
    return {
      columns: [
        col('site', 'Site'),
        col('location', 'Location'),
        col('item', 'Item'),
        col('code', 'Code'),
        col('onHand', 'On hand', 'number', true),
        col('reserved', 'Reserved', 'number', true),
        col('available', 'Available', 'number', true),
      ],
      rows: levels
        .map((l) => {
          const loc = c.paths.get(l.locationId)!;
          return { site: loc.pathNames[0], location: loc.pathNames.slice(1).join(' › ') || loc.name, item: itemName(l.variant), code: l.variant.code, onHand: l.onHand, reserved: l.reserved, available: l.onHand - l.reserved };
        })
        .sort((a, b) => collator.compare(`${a.site} ${a.location}`, `${b.site} ${b.location}`) || collator.compare(a.item, b.item)),
    };
  }

  private async lowStock(c: Ctx): Promise<Built> {
    let rows = await this.stockQuery.lowStock();
    if (c.f.categoryId) {
      const ids = new Set((await this.prisma.product.findMany({ where: { categoryId: c.f.categoryId }, select: { id: true } })).map((p) => p.id));
      rows = rows.filter((r) => ids.has(r.productId));
    }
    return {
      columns: [col('item', 'Item'), col('code', 'Code'), col('available', 'Available', 'number'), col('minStock', 'Minimum', 'number'), col('short', 'Short by', 'number', true)],
      rows: rows.map((r) => ({ item: r.name, code: r.code, available: r.available, minStock: r.minStock, short: r.minStock - r.available })),
    };
  }

  private async movements(c: Ctx): Promise<Built> {
    const { f } = c;
    const ids = f.locationId ? scopeIds(c) : null;
    const moves = await this.prisma.stockMovement.findMany({
      where: {
        createdAt: c.created,
        ...(f.userId && { userId: f.userId }),
        ...(ids && { OR: [{ fromLocationId: { in: ids } }, { toLocationId: { in: ids } }] }),
        ...((f.productId || f.categoryId) && { variant: { product: { ...(f.productId && { id: f.productId }), ...(f.categoryId && { categoryId: f.categoryId }) } } }),
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS + 1,
      include: { user: { select: { name: true } }, variant: { select: { code: true, kind: true, name: true, product: { select: { name: true } } } } },
    });
    return {
      columns: [
        col('date', 'Date', 'datetime'),
        col('type', 'Type'),
        col('item', 'Item'),
        col('code', 'Code'),
        col('qty', 'Qty', 'number'),
        col('from', 'From'),
        col('to', 'To'),
        col('user', 'Done by'),
        col('reason', 'Reason'),
        col('reference', 'Reference'),
        col('note', 'Note'),
      ],
      rows: moves.map((m) => ({
        date: iso(m.createdAt),
        type: MOVEMENT_LABELS[m.type as MovementType],
        item: itemName(m.variant),
        code: m.variant.code,
        qty: m.quantity,
        from: m.fromLocationId ? (c.paths.get(m.fromLocationId)?.path ?? '?') : null,
        to: m.toLocationId ? (c.paths.get(m.toLocationId)?.path ?? '?') : null,
        user: m.user?.name ?? null,
        reason: m.reason,
        reference: m.reference,
        note: m.note,
      })),
    };
  }

  private async damaged(c: Ctx): Promise<Built> {
    const damagedIds = c.all.filter((l) => l.type === LocationType.DAMAGED).map((l) => l.id);
    const levels = await this.prisma.stockLevel.findMany({
      where: { locationId: { in: damagedIds }, onHand: { gt: 0 }, variant: this.variantFilter(c) },
      include: { variant: { select: { id: true, code: true, kind: true, name: true, costPrice: true, product: { select: { name: true } } } } },
    });
    const last = await this.prisma.stockMovement.groupBy({
      by: ['variantId'],
      where: { toLocationId: { in: damagedIds }, variantId: { in: levels.map((l) => l.variantId) } },
      _max: { createdAt: true },
    });
    const lastBy = new Map(last.map((l) => [l.variantId, l._max.createdAt]));
    const showCost = COST_ROLES.includes(c.user.role);
    return {
      columns: [
        col('item', 'Item'),
        col('code', 'Code'),
        col('qty', 'Damaged', 'number', true),
        col('last', 'Last damaged', 'datetime'),
        ...(showCost ? [col('value', 'Value (cost)', 'money', true)] : []),
      ],
      rows: levels.map((l) => ({
        item: itemName(l.variant),
        code: l.variant.code,
        qty: l.onHand,
        last: iso(lastBy.get(l.variantId)),
        ...(showCost && { value: l.variant.costPrice === null ? null : round2(Number(l.variant.costPrice) * l.onHand) }),
      })),
    };
  }

  private async stocktakeVariance(c: Ctx): Promise<Built> {
    const { f } = c;
    const lines = await this.prisma.stocktakeLine.findMany({
      where: {
        adjustment: { not: 0 },
        stocktake: { status: StocktakeStatus.APPROVED, approvedAt: c.created },
        ...(f.locationId && { locationId: { in: scopeIds(c) } }),
        ...((f.productId || f.categoryId) && { variant: { product: { ...(f.productId && { id: f.productId }), ...(f.categoryId && { categoryId: f.categoryId }) } } }),
      },
      take: MAX_ROWS + 1,
      include: {
        stocktake: { select: { code: true, approvedAt: true, approvedBy: { select: { name: true } } } },
        variant: { select: { code: true, kind: true, name: true, costPrice: true, product: { select: { name: true } } } },
      },
      orderBy: { stocktake: { approvedAt: 'asc' } },
    });
    return {
      columns: [
        col('date', 'Approved', 'datetime'),
        col('stocktake', 'Stocktake'),
        col('location', 'Location'),
        col('item', 'Item'),
        col('code', 'Code'),
        col('system', 'System (at count)', 'number'),
        col('counted', 'Counted', 'number'),
        col('adjustment', 'Correction', 'number', true),
        col('approvedBy', 'Approved by'),
      ],
      rows: lines.map((l) => ({
        date: iso(l.stocktake.approvedAt),
        stocktake: l.stocktake.code,
        location: c.paths.get(l.locationId)?.path ?? '?',
        item: itemName(l.variant),
        code: l.variant.code,
        system: l.onHandAtCount ?? l.expected,
        counted: l.counted,
        adjustment: l.adjustment,
        approvedBy: l.stocktake.approvedBy?.name ?? null,
      })),
    };
  }

  private async incompleteKits(c: Ctx): Promise<Built> {
    const { f } = c;
    const kits = await this.prisma.productVariant.findMany({
      where: { kind: VariantKind.KIT, active: true, product: { status: ProductStatus.ACTIVE, ...(f.productId && { id: f.productId }), ...(f.categoryId && { categoryId: f.categoryId }) } },
      include: {
        product: { select: { name: true } },
        components: { include: { componentVariant: { select: { id: true, code: true, name: true, stockLevels: { select: { locationId: true, onHand: true, reserved: true } } } } } },
      },
    });
    const rows: Row[] = [];
    for (const kit of kits) {
      const boxes = kit.components.map((comp) => ({
        variantId: comp.componentVariant.id,
        perKit: comp.quantity,
        available: comp.componentVariant.stockLevels
          .filter((s) => !SYSTEM.includes(c.paths.get(s.locationId)?.type ?? LocationType.SPACE))
          .reduce((n, s) => n + s.onHand - s.reserved, 0),
      }));
      const { sellable, boxes: result } = kitAvailability(boxes);
      if (!result.some((b) => b.spare > 0)) continue;
      for (const b of result) {
        const comp = kit.components.find((x) => x.componentVariant.id === b.variantId)!.componentVariant;
        rows.push({ kit: kit.product.name, box: comp.name.split(' – ')[0], code: comp.code, perKit: b.perKit, available: b.available, complete: sellable, spare: b.spare });
      }
    }
    return {
      columns: [
        col('kit', 'Kit'),
        col('box', 'Box'),
        col('code', 'Code'),
        col('perKit', 'Per kit', 'number'),
        col('available', 'Available', 'number'),
        col('complete', 'Complete kits', 'number'),
        col('spare', 'Spare (incomplete)', 'number', true),
      ],
      rows,
    };
  }

  // ---------------------------------------------------------------- orders

  private async orders(c: Ctx): Promise<Built> {
    const { f } = c;
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: c.created,
        ...(f.userId && { driverId: f.userId }),
        ...(f.productId && { lines: { some: { variant: { productId: f.productId } } } }),
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS + 1,
      include: { driver: { select: { name: true } }, lines: { select: { quantity: true } } },
    });
    return {
      columns: [
        col('date', 'Created', 'datetime'),
        col('order', 'Order'),
        col('source', 'Source'),
        col('customer', 'Customer'),
        col('status', 'Status'),
        col('driver', 'Driver'),
        col('deliveryDate', 'Delivery date', 'date'),
        col('items', 'Items', 'number', true),
        col('payment', 'Payment'),
        col('cod', 'Cash to collect', 'money', true),
      ],
      rows: orders.map((o) => ({
        date: iso(o.createdAt),
        order: o.orderNumber,
        source: o.source === 'WEBSITE' ? `Website #${o.externalId}` : 'Manual',
        customer: o.customerName,
        status: ORDER_LABELS[o.status],
        driver: o.driver?.name ?? null,
        deliveryDate: o.deliveryDate ? o.deliveryDate.toISOString().slice(0, 10) : null,
        items: o.lines.reduce((n, l) => n + l.quantity, 0),
        payment: o.paymentStatus === 'COD' ? 'Cash on delivery' : o.paymentStatus === 'PAID' ? 'Paid' : 'Not paid',
        cod: o.paymentStatus === 'COD' ? num(o.codAmount) : null,
      })),
    };
  }

  /** Everything In Transit right now, split by driver's van (orders) and by transfer. */
  private async inTransit(c: Ctx): Promise<Built> {
    const [allocations, transfers] = await Promise.all([
      this.prisma.orderAllocation.findMany({
        where: { picked: { gt: 0 }, order: { ...(c.f.userId && { driverId: c.f.userId }) } },
        include: {
          order: { select: { orderNumber: true, status: true, customerName: true, driver: { select: { name: true } } } },
          variant: { select: { code: true, kind: true, name: true, product: { select: { name: true } } } },
        },
      }),
      c.f.userId
        ? Promise.resolve([])
        : this.prisma.stockTransferLine.findMany({
            where: { transfer: { status: 'IN_TRANSIT' } },
            include: {
              transfer: { select: { code: true, fromLocationId: true, toLocationId: true, sentBy: { select: { name: true } } } },
              variant: { select: { code: true, kind: true, name: true, product: { select: { name: true } } } },
            },
          }),
    ]);
    const rows: Row[] = [];
    for (const a of allocations) {
      const qty = a.picked - a.delivered - a.returned;
      if (qty <= 0) continue;
      rows.push({ on: a.order.driver ? `🚚 ${a.order.driver.name}` : '🚚 (no driver)', reference: a.order.orderNumber, detail: `${ORDER_LABELS[a.order.status]} · ${a.order.customerName}`, item: itemName(a.variant), code: a.variant.code, qty });
    }
    for (const l of transfers) {
      const qty = l.quantity - l.received - l.lost;
      if (qty <= 0) continue;
      const from = c.paths.get(l.transfer.fromLocationId)?.path ?? '?';
      const to = c.paths.get(l.transfer.toLocationId)?.path ?? '?';
      rows.push({ on: '↔ Transfer', reference: l.transfer.code, detail: `${from} → ${to} (sent by ${l.transfer.sentBy.name})`, item: itemName(l.variant), code: l.variant.code, qty });
    }
    rows.sort((a, b) => String(a.on).localeCompare(String(b.on)) || String(a.reference).localeCompare(String(b.reference)));
    return {
      columns: [col('on', 'On'), col('reference', 'Order / transfer'), col('detail', 'Details'), col('item', 'Item'), col('code', 'Code'), col('qty', 'Qty', 'number', true)],
      rows,
    };
  }

  private async deliveries(c: Ctx): Promise<Built> {
    const { f } = c;
    const orders = await this.prisma.order.findMany({
      where: {
        ...(f.userId && { driverId: f.userId }),
        OR: [
          { status: { in: [OrderStatus.DELIVERED] }, deliveredAt: c.created },
          { status: { in: [OrderStatus.FAILED, OrderStatus.RETURNED] }, updatedAt: c.created },
        ],
      },
      orderBy: { updatedAt: 'asc' },
      take: MAX_ROWS + 1,
      include: {
        driver: { select: { name: true } },
        deliveredBy: { select: { name: true } },
        partialApprovedBy: { select: { name: true } },
        _count: { select: { exceptions: true } },
      },
    });
    return {
      columns: [
        col('order', 'Order'),
        col('customer', 'Customer'),
        col('driver', 'Driver'),
        col('status', 'Result'),
        col('deliveredAt', 'Delivered', 'datetime'),
        col('recipient', 'Received by'),
        col('codExpected', 'Cash expected', 'money', true),
        col('codCollected', 'Cash collected', 'money', true),
        col('codDiff', 'Difference', 'money', true),
        col('partial', 'Partial — approved by'),
        col('failed', 'Failed reason'),
        col('problems', 'Problems reported', 'number', true),
      ],
      rows: orders.map((o) => {
        const expected = o.paymentStatus === 'COD' ? Number(o.codAmount ?? 0) : null;
        const collected = num(o.codCollected);
        return {
          order: o.orderNumber,
          customer: o.customerName,
          driver: o.driver?.name ?? o.deliveredBy?.name ?? null,
          status: ORDER_LABELS[o.status],
          deliveredAt: iso(o.deliveredAt),
          recipient: o.recipientName,
          codExpected: expected,
          codCollected: collected,
          codDiff: expected !== null && collected !== null ? round2(collected - expected) : null,
          partial: o.partialApprovedBy?.name ?? null,
          failed: o.failedReason,
          problems: o._count.exceptions,
        };
      }),
    };
  }

  // ---------------------------------------------------------------- control

  private async pickingErrors(c: Ctx): Promise<Built> {
    const logs = await this.prisma.auditLog.findMany({
      where: { action: 'PICK_REJECTED', createdAt: c.created, ...(c.f.userId && { userId: c.f.userId }) },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS + 1,
      include: { user: { select: { name: true } } },
    });
    const REASONS: Record<string, string> = {
      WRONG_LOCATION: 'Wrong place',
      ALREADY_PICKED: 'Too many',
      WRONG_ITEM: 'Wrong item',
      WRONG_BOX: 'Wrong box',
      UNKNOWN_CODE: 'Unknown code',
      NOT_PICKABLE: 'Order not ready to pick',
      OTHER: 'Other',
    };
    return {
      columns: [col('date', 'Date', 'datetime'), col('user', 'Picker'), col('order', 'Order'), col('code', 'Scanned'), col('location', 'At'), col('reason', 'Error'), col('message', 'Details')],
      rows: logs.map((l) => {
        const d = (l.data ?? {}) as Record<string, string>;
        return {
          date: iso(l.createdAt),
          user: l.user?.name ?? null,
          order: d.orderNumber ?? null,
          code: d.code ?? null,
          location: d.locationId ? (c.paths.get(d.locationId)?.path ?? null) : null,
          reason: REASONS[d.reason] ?? d.reason ?? null,
          message: d.message ?? null,
        };
      }),
    };
  }

  private async overrides(c: Ctx): Promise<Built> {
    const ACTIONS: Record<string, string> = {
      PICK_LOCATION_OVERRIDE: 'Picked from a different place',
      ORDER_SHORT_APPROVED: 'Sent with items missing',
      ORDER_DELIVERED_PARTIAL: 'Partial delivery',
      SALE_COMPLETED: 'Discount above limit',
      STOCKTAKE_APPROVED: 'Stocktake approved',
    };
    const logs = await this.prisma.auditLog.findMany({
      where: { action: { in: Object.keys(ACTIONS) }, createdAt: c.created, ...(c.f.userId && { userId: c.f.userId }) },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS * 2,
      include: { user: { select: { name: true } } },
    });
    // A sale is only an override when a manager approved its discount.
    const relevant = logs.filter((l) => l.action !== 'SALE_COMPLETED' || (l.data as Record<string, unknown> | null)?.approvedById);
    const approverIds = [
      ...new Set(
        relevant
          .map((l) => {
            const d = (l.data ?? {}) as Record<string, string>;
            return d.approvedById ?? d.partialApprovedById;
          })
          .filter(Boolean),
      ),
    ];
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return {
      columns: [col('date', 'Date', 'datetime'), col('type', 'Override'), col('user', 'Done by'), col('approvedBy', 'Approved by'), col('reference', 'Reference'), col('details', 'Details')],
      rows: relevant.map((l) => {
        const d = (l.data ?? {}) as Record<string, string | number | null>;
        const approver = (d.approvedById ?? d.partialApprovedById) as string | undefined;
        return {
          date: iso(l.createdAt),
          type: ACTIONS[l.action],
          user: l.user?.name ?? null,
          approvedBy: approver ? (names.get(approver) ?? null) : l.action === 'STOCKTAKE_APPROVED' ? (l.user?.name ?? null) : null,
          reference: (d.orderNumber ?? d.invoiceNumber ?? d.code ?? null) as string | null,
          details: [d.item, d.reason, d.expectedFrom && `expected ${d.expectedFrom}, taken from ${d.pickedFrom}`, d.missing && `${d.missing} missing`, d.notDelivered && `${d.notDelivered} not delivered`, d.adjustments !== undefined && `${d.adjustments} correction(s)`]
            .filter(Boolean)
            .join(' · ') || null,
        };
      }),
    };
  }
}

interface Ctx {
  f: ReportFilters;
  user: AuthUser;
  all: LocationWithPath[];
  paths: Map<string, LocationWithPath>;
  created: { gte?: Date; lt?: Date };
}

interface Built {
  columns: Column[];
  rows: Row[];
}

function col(key: string, label: string, type: Column['type'] = 'text', total = false): Column {
  return { key, label, type, ...(total && { total }) };
}

function scopeIds(c: Ctx): string[] {
  return withDescendants(c.all, [c.f.locationId!]).map((l) => l.id);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
