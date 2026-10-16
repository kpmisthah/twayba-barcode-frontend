import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MovementType, Prisma, ReturnCondition } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { nextCounter } from '../catalog/products.service.js';
import { LocationsService } from '../locations/locations.service.js';
import { SiteAccessService } from '../locations/site-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { fromCents, toCents } from '../sales/pricing.js';
import { MoveInput, StockService } from '../stock/stock.service.js';
import { CreateReturnDto, ListReturnsQuery } from './dto/return.dto.js';
import { boxesPerUnit, refundFor } from './refund.js';

export const creditNoteInclude = {
  sale: { select: { id: true, invoiceNumber: true, customerName: true, customerPhone: true, currency: true, createdAt: true } },
  cashier: { select: { id: true, name: true } },
  lines: {
    include: {
      saleLine: { select: { description: true, code: true, quantity: true, unitPrice: true, taxRate: true } },
    },
  },
} satisfies Prisma.CreditNoteInclude;

export function creditNumber(n: number) {
  return `CN-${String(n).padStart(6, '0')}`;
}

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
    private readonly locations: LocationsService,
    private readonly sites: SiteAccessService,
  ) {}

  async create(user: AuthUser, dto: CreateReturnDto) {
    const ids = dto.lines.map((l) => l.saleLineId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Each invoice line can only appear once');
    await this.sites.assert(user, dto.lines.filter((l) => l.condition === ReturnCondition.GOOD).map((l) => l.locationId));
    const damagedId = await this.stock.damagedLocationId();

    const note = await this.prisma.$transaction(
      async (tx) => {
        // Lock the invoice so two returns against it can't both pass the "not more than sold" check.
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sales WHERE id = ${dto.saleId}::uuid FOR UPDATE`;
        if (!locked.length) throw new NotFoundException('Invoice not found');
        const sale = await tx.sale.findUniqueOrThrow({
          where: { id: dto.saleId },
          include: { lines: { include: { picks: true, returnLines: true } } },
        });

        const number = await nextCounter(tx, 'credit_note');
        const code = creditNumber(number);
        const lines: Prisma.CreditNoteLineCreateWithoutCreditNoteInput[] = [];
        const moves: MoveInput[] = [];
        let totalCents = 0;
        let taxCents = 0;

        for (const req of dto.lines) {
          const line = sale.lines.find((l) => l.id === req.saleLineId);
          if (!line) throw new BadRequestException('That item is not on this invoice');
          const toLocationId = req.condition === ReturnCondition.DAMAGED ? damagedId : req.locationId;
          if (!toLocationId) throw new BadRequestException(`${line.description}: choose where it goes back to`);

          const already = line.returnLines.reduce(
            (a, r) => ({ quantity: a.quantity + r.quantity, totalCents: a.totalCents + toCents(r.total), taxCents: a.taxCents + toCents(r.taxAmount) }),
            { quantity: 0, totalCents: 0, taxCents: 0 },
          );
          let refund: { totalCents: number; taxCents: number };
          try {
            refund = refundFor({ quantity: line.quantity, totalCents: toCents(line.total), taxCents: toCents(line.taxAmount) }, already, req.quantity);
          } catch (e) {
            throw new BadRequestException(`${line.description}: ${(e as Error).message}`);
          }
          totalCents += refund.totalCents;
          taxCents += refund.taxCents;
          lines.push({
            saleLine: { connect: { id: line.id } },
            quantity: req.quantity,
            condition: req.condition,
            location: { connect: { id: toLocationId } },
            total: fromCents(refund.totalCents),
            taxAmount: fromCents(refund.taxCents),
          });

          // A kit comes back as all of its boxes, in the numbers sold.
          for (const [variantId, perUnit] of boxesPerUnit(line.picks, line.quantity)) {
            moves.push({
              type: MovementType.SALE_RETURN,
              variantId,
              quantity: perUnit * req.quantity,
              toLocationId,
              reason: req.condition === ReturnCondition.DAMAGED ? 'Returned damaged' : 'Customer return',
              note: dto.reason,
              reference: code,
            });
          }
        }

        const created = await tx.creditNote.create({
          data: {
            number,
            creditNumber: code,
            saleId: sale.id,
            cashierId: user.id,
            reason: dto.reason?.trim() || null,
            refundMethod: dto.refundMethod,
            refundReference: dto.refundReference?.trim() || null,
            netTotal: fromCents(totalCents - taxCents),
            taxTotal: fromCents(taxCents),
            total: fromCents(totalCents),
            lines: { create: lines },
          },
        });
        await this.stock.apply(user.id, moves, tx);
        await this.audit.log(
          {
            userId: user.id,
            action: 'RETURN_COMPLETED',
            entity: 'CreditNote',
            entityId: created.id,
            data: { creditNumber: code, invoiceNumber: sale.invoiceNumber, total: fromCents(totalCents) },
          },
          tx,
        );
        return created;
      },
      { timeout: 20_000 },
    );

    return this.get(note.id);
  }

  async get(id: string) {
    const note = await this.prisma.creditNote.findUnique({ where: { id }, include: creditNoteInclude });
    if (!note) throw new NotFoundException('Credit note not found');
    const paths = new Map((await this.locations.withPaths()).map((l) => [l.id, l.path]));
    return { ...note, lines: note.lines.map((l) => ({ ...l, locationPath: paths.get(l.locationId) ?? '?' })) };
  }

  async list(query: ListReturnsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const q = query.q?.trim();
    const where: Prisma.CreditNoteWhereInput = q
      ? {
          OR: [
            { creditNumber: { contains: q, mode: 'insensitive' } },
            { sale: { invoiceNumber: { contains: q, mode: 'insensitive' } } },
            { sale: { customerName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.creditNote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { sale: { select: { id: true, invoiceNumber: true, customerName: true } }, cashier: { select: { id: true, name: true } } },
      }),
      this.prisma.creditNote.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
