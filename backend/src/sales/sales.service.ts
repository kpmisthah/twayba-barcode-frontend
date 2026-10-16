import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LocationType, MovementType, Prisma, ProductStatus, VariantKind } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { APPROVER_ROLES, verifyApprover } from '../auth/approver.js';
import type { AuthUser } from '../auth/auth.types.js';
import { nextCounter } from '../catalog/products.service.js';
import { withDescendants } from '../locations/location-tree.js';
import { LocationsService } from '../locations/locations.service.js';
import { SiteAccessService } from '../locations/site-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { StockService } from '../stock/stock.service.js';
import { CreateSaleDto, ListSalesQuery, PriceLineDto } from './dto/sale.dto.js';
import { pickProblem } from './picks.js';
import { fromCents, priceLine, PricedLine, settle, sumLines, toCents } from './pricing.js';

export const saleInclude = {
  site: { select: { id: true, name: true } },
  cashier: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  lines: {
    orderBy: { lineNo: 'asc' },
    include: {
      picks: { select: { variantId: true, locationId: true, quantity: true } },
      returnLines: { select: { quantity: true } },
    },
  },
  payments: { orderBy: { createdAt: 'asc' } },
  creditNotes: { orderBy: { createdAt: 'asc' }, select: { id: true, creditNumber: true, total: true, createdAt: true } },
} satisfies Prisma.SaleInclude;

export function invoiceNumber(n: number) {
  return `INV-${String(n).padStart(6, '0')}`;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly stock: StockService,
    private readonly locations: LocationsService,
    private readonly sites: SiteAccessService,
  ) {}

  /** Prices a cart exactly as a sale would be charged (the POS shows these numbers). */
  async preview(user: AuthUser, lines: PriceLineDto[]) {
    const settings = await this.settings.getAll();
    const priced = await this.priceLines(lines, settings.pricesIncludeTax);
    const totals = sumLines(priced.map((p) => p.priced));
    return {
      lines: priced.map((p) => ({ variantId: p.variant.id, ...money(p.priced), unitPrice: fromCents(p.unitCents), taxRate: p.taxRate })),
      totals: money(totals),
      maxDiscountPercent: settings.maxDiscountPercent,
      needsApproval: this.needsApproval(user, lines, settings.maxDiscountPercent),
    };
  }

  async create(user: AuthUser, dto: CreateSaleDto) {
    const settings = await this.settings.getAll();
    const priced = await this.priceLines(dto.lines, settings.pricesIncludeTax);

    // Stock taken must match what is sold (every box of a kit, exact quantities).
    for (const [i, line] of dto.lines.entries()) {
      const p = priced[i];
      const problem = pickProblem(
        {
          name: p.description,
          kind: p.variant.kind === VariantKind.KIT ? 'KIT' : 'STANDARD',
          variantId: p.variant.id,
          quantity: line.quantity,
          boxes: p.variant.components.map((c) => ({
            variantId: c.componentVariantId,
            name: c.componentVariant.name.split(' – ')[0],
            perKit: c.quantity,
          })),
        },
        line.picks,
      );
      if (problem) throw new BadRequestException(problem);
    }

    if (dto.siteId) await this.assertPicksInSite(dto.siteId, dto.lines.flatMap((l) => l.picks.map((p) => p.locationId)));
    await this.sites.assert(user, [dto.siteId, ...dto.lines.flatMap((l) => l.picks.map((p) => p.locationId))]);

    let approvedById: string | null = null;
    if (this.needsApproval(user, dto.lines, settings.maxDiscountPercent)) {
      if (!dto.approval) {
        throw new ForbiddenException(`A discount above ${settings.maxDiscountPercent}% needs a manager's approval`);
      }
      approvedById = await verifyApprover(this.prisma, dto.approval);
    }

    const totals = sumLines(priced.map((p) => p.priced));
    let settlement: { paidCents: number; changeCents: number };
    try {
      settlement = settle(
        totals.totalCents,
        dto.payments.map((p) => ({ method: p.method, cents: toCents(p.amount) })),
      );
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const sale = await this.prisma.$transaction(
      async (tx) => {
        // The counter row is locked until commit, and rolls back with a failed sale: no gaps.
        const number = await nextCounter(tx, 'invoice');
        const invoice = invoiceNumber(number);
        const created = await tx.sale.create({
          data: {
            number,
            invoiceNumber: invoice,
            siteId: dto.siteId ?? null,
            cashierId: user.id,
            approvedById,
            customerName: dto.customerName?.trim() || null,
            customerPhone: dto.customerPhone?.trim() || null,
            note: dto.note?.trim() || null,
            currency: settings.currency,
            pricesIncludeTax: settings.pricesIncludeTax,
            grossTotal: fromCents(totals.grossCents),
            discountTotal: fromCents(totals.discountCents),
            netTotal: fromCents(totals.netCents),
            taxTotal: fromCents(totals.taxCents),
            total: fromCents(totals.totalCents),
            paidTotal: fromCents(settlement.paidCents),
            changeGiven: fromCents(settlement.changeCents),
            lines: {
              create: dto.lines.map((line, i) => {
                const p = priced[i];
                return {
                  lineNo: i + 1,
                  variantId: p.variant.id,
                  description: p.description,
                  code: p.variant.code,
                  quantity: line.quantity,
                  unitPrice: fromCents(p.unitCents),
                  discountPercent: line.discountPercent ?? 0,
                  discountAmount: fromCents(p.priced.discountCents),
                  taxRateName: p.taxRateName,
                  taxRate: p.taxRate,
                  taxAmount: fromCents(p.priced.taxCents),
                  total: fromCents(p.priced.totalCents),
                  picks: { create: line.picks.map((pk) => ({ variantId: pk.variantId, locationId: pk.locationId, quantity: pk.quantity })) },
                };
              }),
            },
            payments: {
              create: dto.payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference?.trim() || null })),
            },
          },
        });

        await this.stock.apply(
          user.id,
          dto.lines.flatMap((l) =>
            l.picks.map((pk) => ({
              type: MovementType.SALE,
              variantId: pk.variantId,
              quantity: pk.quantity,
              fromLocationId: pk.locationId,
              reference: invoice,
            })),
          ),
          tx,
        );

        await this.audit.log(
          {
            userId: user.id,
            action: 'SALE_COMPLETED',
            entity: 'Sale',
            entityId: created.id,
            data: { invoiceNumber: invoice, total: fromCents(totals.totalCents), approvedById },
          },
          tx,
        );
        return created;
      },
      { timeout: 20_000 },
    );

    return this.get(sale.id);
  }

  async get(id: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: saleInclude });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  /** Totals for a period (the dashboard asks for "today" in the shop's time zone). */
  async summary(from: Date, to: Date) {
    const range = { createdAt: { gte: from, lt: to } };
    const [sales, returns] = await Promise.all([
      this.prisma.sale.aggregate({ where: range, _count: true, _sum: { total: true } }),
      this.prisma.creditNote.aggregate({ where: range, _count: true, _sum: { total: true } }),
    ]);
    return {
      salesCount: sales._count,
      salesTotal: (sales._sum.total ?? 0).toString(),
      returnsCount: returns._count,
      returnsTotal: (returns._sum.total ?? 0).toString(),
    };
  }

  /** For scanning the barcode on a receipt, or typing the invoice number. */
  async findByNumber(invoice: string) {
    const sale = await this.prisma.sale.findUnique({ where: { invoiceNumber: invoice.trim().toUpperCase() }, select: { id: true } });
    if (!sale) throw new NotFoundException(`No invoice ${invoice.trim()}`);
    return this.get(sale.id);
  }

  async list(query: ListSalesQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const q = query.q?.trim();
    const where: Prisma.SaleWhereInput = {
      ...(q && {
        OR: [
          { invoiceNumber: { contains: q, mode: 'insensitive' } },
          { customerName: { contains: q, mode: 'insensitive' } },
          { customerPhone: { contains: q } },
        ],
      }),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lt: endOfDay(query.to) }),
        },
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { cashier: { select: { id: true, name: true } }, _count: { select: { lines: true } } },
      }),
      this.prisma.sale.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  // ---------------------------------------------------------------- helpers

  private async priceLines(lines: PriceLineDto[], pricesIncludeTax: boolean) {
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: [...new Set(lines.map((l) => l.variantId))] } },
      include: {
        product: { select: { name: true, status: true, taxRate: { select: { name: true, rate: true } } } },
        components: { include: { componentVariant: { select: { name: true } } } },
      },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    return lines.map((line) => {
      const variant = byId.get(line.variantId);
      if (!variant) throw new NotFoundException('One of the items no longer exists');
      const description = variant.kind === VariantKind.STANDARD && variant.name !== 'Default'
        ? `${variant.product.name} – ${variant.name}`
        : variant.product.name;
      if (variant.kind === VariantKind.COMPONENT) {
        throw new BadRequestException(`${description}: a single box can't be sold — sell the whole kit`);
      }
      if (!variant.active || variant.product.status === ProductStatus.INACTIVE) {
        throw new BadRequestException(`${description} is not for sale (inactive)`);
      }
      if (variant.price === null) throw new BadRequestException(`${description} has no price`);

      const unitCents = toCents(variant.price);
      const taxRate = variant.product.taxRate ? Number(variant.product.taxRate.rate) : 0;
      const priced: PricedLine = priceLine(
        { unitCents, quantity: line.quantity, discountPercent: line.discountPercent ?? 0, taxRate },
        pricesIncludeTax,
      );
      return { variant, description, unitCents, taxRate, taxRateName: variant.product.taxRate?.name ?? null, priced };
    });
  }

  private needsApproval(user: AuthUser, lines: PriceLineDto[], maxPercent: number) {
    return !APPROVER_ROLES.includes(user.role) && lines.some((l) => (l.discountPercent ?? 0) > maxPercent);
  }

  /** The POS only sells from spaces inside its own site. */
  private async assertPicksInSite(siteId: string, locationIds: string[]) {
    const all = await this.locations.withPaths();
    const site = all.find((l) => l.id === siteId);
    if (!site || site.type !== LocationType.SITE) throw new BadRequestException('Unknown shop/site');
    const inside = new Set(withDescendants(all, [siteId]).map((l) => l.id));
    const outside = locationIds.find((id) => !inside.has(id));
    if (outside) {
      const path = all.find((l) => l.id === outside)?.path ?? 'another site';
      throw new BadRequestException(`${path} is not in ${site.name} — the POS only sells stock from its own site`);
    }
  }
}

function money(p: PricedLine) {
  return {
    gross: fromCents(p.grossCents),
    discount: fromCents(p.discountCents),
    net: fromCents(p.netCents),
    tax: fromCents(p.taxCents),
    total: fromCents(p.totalCents),
  };
}

function endOfDay(date: string) {
  const d = new Date(date);
  d.setUTCHours(24, 0, 0, 0);
  return d;
}
