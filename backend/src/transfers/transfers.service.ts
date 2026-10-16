import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType, MovementType, Prisma, Role, TransferStatus, VariantKind } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { nextCounter } from '../catalog/products.service.js';
import { LocationsService } from '../locations/locations.service.js';
import { SiteAccessService } from '../locations/site-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StockService } from '../stock/stock.service.js';
import { ListTransfersQuery, ReceiveTransferDto, SendTransferDto } from './dto/transfer.dto.js';

type Tx = Prisma.TransactionClient;
const SYSTEM: LocationType[] = [LocationType.TRANSIT, LocationType.DAMAGED];
const MANAGERS: Role[] = [Role.ADMIN, Role.MANAGER];

export const transferInclude = {
  sentBy: { select: { id: true, name: true } },
  receivedBy: { select: { id: true, name: true } },
  lines: { include: { variant: { select: { id: true, kind: true, code: true, name: true, product: { select: { id: true, name: true, images: true } } } } } },
} satisfies Prisma.StockTransferInclude;

export function transferCode(n: number) {
  return `TR-${String(n).padStart(6, '0')}`;
}

/**
 * Two-step transfers (client brief §6): send = scan out at the source (stock goes In Transit),
 * receive = scan in at the destination. Partial receipts are allowed; what never arrives is
 * written off by a manager with a reason.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
    private readonly locations: LocationsService,
    private readonly sites: SiteAccessService,
  ) {}

  async send(user: AuthUser, dto: SendTransferDto) {
    if (dto.fromLocationId === dto.toLocationId) throw new BadRequestException('Choose a different destination');
    await this.sites.assert(user, [dto.fromLocationId]);
    const all = await this.locations.withPaths();
    const parents = new Set(all.filter((l) => l.active && l.parentId).map((l) => l.parentId));
    for (const id of [dto.fromLocationId, dto.toLocationId]) {
      const loc = all.find((l) => l.id === id);
      if (!loc) throw new NotFoundException('Location not found');
      if (SYSTEM.includes(loc.type)) throw new BadRequestException(`${loc.name} can't be used for a transfer`);
      if (id === dto.toLocationId && (!loc.active || parents.has(loc.id))) throw new BadRequestException(`${loc.path} can't receive stock — choose the exact space`);
    }

    // A whole kit is sent as all of its boxes.
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: dto.lines.map((l) => l.variantId) } },
      select: { id: true, kind: true, components: { select: { componentVariantId: true, quantity: true } } },
    });
    const qty = new Map<string, number>();
    for (const line of dto.lines) {
      const v = variants.find((x) => x.id === line.variantId);
      if (!v) throw new NotFoundException('One of the items no longer exists');
      const parts = v.kind === VariantKind.KIT ? v.components.map((c) => ({ id: c.componentVariantId, n: c.quantity * line.quantity })) : [{ id: v.id, n: line.quantity }];
      for (const p of parts) qty.set(p.id, (qty.get(p.id) ?? 0) + p.n);
    }

    const transfer = await this.prisma.$transaction(async (tx) => {
      const transitId = await this.stock.transitLocationId(tx);
      const number = await nextCounter(tx, 'transfer');
      const code = transferCode(number);
      const created = await tx.stockTransfer.create({
        data: {
          number,
          code,
          fromLocationId: dto.fromLocationId,
          toLocationId: dto.toLocationId,
          note: dto.note?.trim() || null,
          sentById: user.id,
          lines: { create: [...qty].map(([variantId, quantity]) => ({ variantId, quantity })) },
        },
      });
      await this.stock.apply(
        user.id,
        [...qty].map(([variantId, quantity]) => ({ type: MovementType.TRANSFER_OUT, variantId, quantity, fromLocationId: dto.fromLocationId, toLocationId: transitId, reference: code, note: dto.note })),
        tx,
      );
      await this.audit.log({ userId: user.id, action: 'TRANSFER_SENT', entity: 'StockTransfer', entityId: created.id, data: { code, units: [...qty.values()].reduce((s, n) => s + n, 0) } }, tx);
      return created;
    });
    return this.get(transfer.id);
  }

  /** Scanned in at the destination. Anything not yet received stays In Transit. */
  async receive(user: AuthUser, id: string, dto: ReceiveTransferDto) {
    await this.prisma.$transaction(async (tx) => {
      const t = await this.lock(tx, id);
      if (t.status !== TransferStatus.IN_TRANSIT) throw new BadRequestException(`${t.code} is ${t.status.toLowerCase().replace('_', ' ')}`);
      await this.sites.assert(user, [t.toLocationId]);

      const arriving = new Map<string, number>();
      for (const l of dto.lines) arriving.set(l.variantId, (arriving.get(l.variantId) ?? 0) + l.quantity);
      for (const [variantId, n] of arriving) {
        const line = t.lines.find((x) => x.variantId === variantId);
        if (!line) throw new BadRequestException('That item is not part of this transfer');
        const left = line.quantity - line.received - line.lost;
        if (n > left) throw new BadRequestException(`Only ${left} of that item still expected`);
      }
      const transitId = await this.stock.transitLocationId(tx);
      await this.stock.apply(
        user.id,
        [...arriving].map(([variantId, quantity]) => ({ type: MovementType.TRANSFER_IN, variantId, quantity, fromLocationId: transitId, toLocationId: t.toLocationId, reference: t.code })),
        tx,
      );
      for (const [variantId, n] of arriving) {
        await tx.stockTransferLine.update({ where: { transferId_variantId: { transferId: id, variantId } }, data: { received: { increment: n } } });
      }
      const lines = await tx.stockTransferLine.findMany({ where: { transferId: id } });
      const done = lines.every((l) => l.received + l.lost >= l.quantity);
      await tx.stockTransfer.update({
        where: { id },
        data: { receivedById: user.id, receivedAt: new Date(), ...(done && { status: TransferStatus.RECEIVED }) },
      });
      await this.audit.log({ userId: user.id, action: 'TRANSFER_RECEIVED', entity: 'StockTransfer', entityId: id, data: { code: t.code, units: [...arriving.values()].reduce((s, n) => s + n, 0), complete: done } }, tx);
    });
    return this.get(id);
  }

  /** Manager: what never arrived is written off (ADJUSTMENT out of In Transit) and the transfer is closed. */
  async closeMissing(user: AuthUser, id: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const t = await this.lock(tx, id);
      if (t.status !== TransferStatus.IN_TRANSIT) throw new BadRequestException(`${t.code} is already closed`);
      const transitId = await this.stock.transitLocationId(tx);
      const missing = t.lines.map((l) => ({ l, n: l.quantity - l.received - l.lost })).filter((x) => x.n > 0);
      await this.stock.apply(
        user.id,
        missing.map(({ l, n }) => ({ type: MovementType.ADJUSTMENT, variantId: l.variantId, quantity: n, fromLocationId: transitId, reason: 'Lost in transfer', note: reason, reference: t.code })),
        tx,
      );
      for (const { l, n } of missing) await tx.stockTransferLine.update({ where: { id: l.id }, data: { lost: { increment: n } } });
      await tx.stockTransfer.update({ where: { id }, data: { status: TransferStatus.RECEIVED, closedReason: reason.trim() } });
      await this.audit.log({ userId: user.id, action: 'TRANSFER_CLOSED_MISSING', entity: 'StockTransfer', entityId: id, data: { code: t.code, missing: missing.reduce((s, x) => s + x.n, 0), reason } }, tx);
    });
    return this.get(id);
  }

  /** Before anything was received: the stock goes back to where it came from. */
  async cancel(user: AuthUser, id: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const t = await this.lock(tx, id);
      if (t.status !== TransferStatus.IN_TRANSIT) throw new BadRequestException(`${t.code} is already closed`);
      if (t.lines.some((l) => l.received > 0)) throw new BadRequestException('Part of it was already received — close it instead');
      if (!MANAGERS.includes(user.role) && t.sentById !== user.id) throw new ForbiddenException('Only the sender or a manager can cancel a transfer');
      const transitId = await this.stock.transitLocationId(tx);
      await this.stock.apply(
        user.id,
        t.lines.map((l) => ({ type: MovementType.TRANSFER_IN, variantId: l.variantId, quantity: l.quantity, fromLocationId: transitId, toLocationId: t.fromLocationId, reference: t.code, reason: 'Transfer cancelled' })),
        tx,
      );
      await tx.stockTransfer.update({ where: { id }, data: { status: TransferStatus.CANCELLED, closedReason: reason.trim() } });
      await this.audit.log({ userId: user.id, action: 'TRANSFER_CANCELLED', entity: 'StockTransfer', entityId: id, data: { code: t.code, reason } }, tx);
    });
    return this.get(id);
  }

  async get(id: string) {
    const t = await this.prisma.stockTransfer.findUnique({ where: { id }, include: transferInclude });
    if (!t) throw new NotFoundException('Transfer not found');
    const paths = new Map((await this.locations.withPaths()).map((l) => [l.id, l]));
    return { ...t, from: pathInfo(paths.get(t.fromLocationId)), to: pathInfo(paths.get(t.toLocationId)) };
  }

  async list(query: ListTransfersQuery) {
    const rows = await this.prisma.stockTransfer.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: { sentAt: 'desc' },
      take: 100,
      include: { sentBy: { select: { name: true } }, lines: { select: { quantity: true, received: true, lost: true } } },
    });
    const paths = new Map((await this.locations.withPaths()).map((l) => [l.id, l]));
    return rows.map(({ lines, ...t }) => ({
      ...t,
      from: pathInfo(paths.get(t.fromLocationId)),
      to: pathInfo(paths.get(t.toLocationId)),
      units: lines.reduce((s, l) => s + l.quantity, 0),
      received: lines.reduce((s, l) => s + l.received, 0),
      lost: lines.reduce((s, l) => s + l.lost, 0),
    }));
  }

  private async lock(tx: Tx, id: string) {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM stock_transfers WHERE id = ${id}::uuid FOR UPDATE`;
    if (!locked.length) throw new NotFoundException('Transfer not found');
    return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: { lines: true } });
  }
}

function pathInfo(l?: { id: string; path: string; siteId: string }) {
  return l ? { id: l.id, path: l.path, siteId: l.siteId } : null;
}
