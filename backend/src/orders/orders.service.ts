import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  LocationType,
  MovementType,
  OrderSource,
  OrderStatus,
  Prisma,
  ProductStatus,
  ReturnCondition,
  Role,
  VariantKind,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { verifyApprover } from '../auth/approver.js';
import type { AuthUser } from '../auth/auth.types.js';
import { nextCounter } from '../catalog/products.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { LocationsService } from '../locations/locations.service.js';
import { SiteAccessService } from '../locations/site-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MoveInput, StockService } from '../stock/stock.service.js';
import { allocationProblem, Need, suggestAllocation } from './allocation.js';
import {
  AllocateDto,
  CreateOrderDto,
  ListOrdersQuery,
  PickDto,
  ReturnScanDto,
  ShortPickDto,
  UpdateOrderDto,
  WebhookOrderDto,
} from './dto/order.dto.js';

type Tx = Prisma.TransactionClient;

const SYSTEM: LocationType[] = [LocationType.TRANSIT, LocationType.DAMAGED];
const EDITABLE: OrderStatus[] = [OrderStatus.NEW, OrderStatus.ALLOCATED, OrderStatus.PICKING];
const PICKABLE: OrderStatus[] = [OrderStatus.ALLOCATED, OrderStatus.PICKING];
const CANCELLABLE: OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.ALLOCATED,
  OrderStatus.PICKING,
  OrderStatus.LOADED,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.FAILED,
];
/** Loaded stock still on the van for these orders must be scanned back into stock. */
const RETURNABLE: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.FAILED, OrderStatus.DELIVERED];
/** Not finished yet (a driver's to-do list). */
export const OPEN_STATUSES: OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.ALLOCATED,
  OrderStatus.PICKING,
  OrderStatus.LOADED,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.FAILED,
];

/** Units of an allocation that are on the van right now. */
export const inTransitOf = (a: { picked: number; delivered: number; returned: number }) => a.picked - a.delivered - a.returned;

/** Drivers may only see and work on orders assigned to them (404, so other orders aren't revealed). */
export function assertCanSee(user: AuthUser, order: { driverId: string | null }) {
  if (user.role === Role.DRIVER && order.driverId !== user.id) throw new NotFoundException('Order not found');
}

/** WRONG_LOCATION | ALREADY_PICKED | WRONG_ITEM | WRONG_BOX | UNKNOWN_CODE | NOT_PICKABLE | OTHER */
function pickErrorReason(e: Error, response: string | object): string {
  if (typeof response === 'object' && 'code' in response) return String(response.code);
  if (e instanceof NotFoundException) return 'UNKNOWN_CODE';
  if (e.message.startsWith('Wrong item')) return 'WRONG_ITEM';
  if (e.message.startsWith('Wrong box')) return 'WRONG_BOX';
  if (e.message.includes('nothing to pick')) return 'NOT_PICKABLE';
  return 'OTHER';
}

/** Locks the order row so two pickers/drivers/managers can't change it at the same time. */
export async function lockOrder(tx: Tx, id: string, user: AuthUser) {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
  if (!locked.length) throw new NotFoundException('Order not found');
  const order = await tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
  assertCanSee(user, order);
  return order;
}

const variantSelect = {
  id: true,
  kind: true,
  code: true,
  name: true,
  product: { select: { id: true, name: true, images: true } },
} satisfies Prisma.ProductVariantSelect;

export const orderInclude = {
  driver: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  shortApprovedBy: { select: { id: true, name: true } },
  deliveredBy: { select: { id: true, name: true } },
  partialApprovedBy: { select: { id: true, name: true } },
  exceptions: {
    orderBy: { createdAt: 'asc' },
    include: {
      reportedBy: { select: { id: true, name: true } },
      variant: { select: { id: true, code: true, name: true } },
      location: { select: { id: true, name: true } },
    },
  },
  lines: {
    orderBy: { lineNo: 'asc' },
    include: {
      variant: {
        select: {
          ...variantSelect,
          components: { select: { quantity: true, componentVariant: { select: { id: true, code: true, name: true } } } },
        },
      },
    },
  },
  allocations: { include: { variant: { select: variantSelect } } },
} satisfies Prisma.OrderInclude;

type OrderWithLines = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function orderNumber(n: number) {
  return `ORD-${String(n).padStart(6, '0')}`;
}

const itemName = (v: { name: string; kind: VariantKind; product: { name: string } }) =>
  v.kind === VariantKind.STANDARD && v.name !== 'Default' ? `${v.product.name} – ${v.name}` : v.kind === VariantKind.COMPONENT ? `${v.product.name}, ${v.name.split(' – ')[0]}` : v.product.name;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
    private readonly locations: LocationsService,
    private readonly sites: SiteAccessService,
  ) {}

  // ---------------------------------------------------------------- create / read

  async create(user: AuthUser | null, dto: CreateOrderDto, source: OrderSource = OrderSource.MANUAL, externalId?: string, prices?: (number | undefined)[]) {
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: dto.lines.map((l) => l.variantId) } },
      select: { ...variantSelect, active: true, product: { select: { id: true, name: true, images: true, status: true } } },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));
    for (const l of dto.lines) {
      const v = byId.get(l.variantId);
      if (!v) throw new NotFoundException('One of the items no longer exists');
      if (v.kind === VariantKind.COMPONENT) throw new BadRequestException(`${itemName(v)}: order the whole kit, not one box`);
      if (!v.active || v.product.status === ProductStatus.INACTIVE) throw new BadRequestException(`${itemName(v)} is inactive`);
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const number = await nextCounter(tx, 'order');
      const created = await tx.order.create({
        data: {
          number,
          orderNumber: orderNumber(number),
          source,
          externalId: externalId ?? null,
          ...details(dto),
          customerName: dto.customerName.trim(),
          createdById: user?.id ?? null,
          lines: {
            create: dto.lines.map((l, i) => ({
              lineNo: i + 1,
              variantId: l.variantId,
              description: itemName(byId.get(l.variantId)!),
              quantity: l.quantity,
              unitPrice: prices?.[i] ?? null,
            })),
          },
        },
      });
      await this.audit.log(
        { userId: user?.id ?? null, action: 'ORDER_CREATED', entity: 'Order', entityId: created.id, data: { orderNumber: created.orderNumber, source, externalId } },
        tx,
      );
      return created;
    });
    return this.get(order.id);
  }

  /**
   * Website order (webhook). Idempotent: the same externalId returns the existing order.
   * Items are matched by our SKU, or by barcode; unknown items reject the whole order (422).
   */
  async importFromWebsite(dto: WebhookOrderDto) {
    const existing = await this.prisma.order.findUnique({ where: { source_externalId: { source: OrderSource.WEBSITE, externalId: dto.externalId } } });
    if (existing) return { duplicate: true, order: await this.get(existing.id) };

    const lines: { variantId: string; quantity: number }[] = [];
    const unknown: string[] = [];
    for (const item of dto.items) {
      const code = item.sku.trim();
      const variant =
        (await this.prisma.productVariant.findFirst({ where: { sku: { equals: code, mode: 'insensitive' } }, select: { id: true } })) ??
        (await this.prisma.barcode.findFirst({ where: { code, active: true }, select: { variantId: true } }).then((b) => (b ? { id: b.variantId } : null)));
      if (variant) lines.push({ variantId: variant.id, quantity: item.quantity });
      else unknown.push(code);
    }
    if (unknown.length) {
      throw new UnprocessableEntityException({ message: `Unknown SKU(s): ${unknown.join(', ')}`, unknownSkus: unknown });
    }
    try {
      const order = await this.create(null, { ...dto, lines }, OrderSource.WEBSITE, dto.externalId, dto.items.map((i) => i.price));
      return { duplicate: false, order };
    } catch (e) {
      // The same order arrived twice at the same moment.
      if (isUniqueViolation(e)) {
        const order = await this.prisma.order.findUniqueOrThrow({ where: { source_externalId: { source: OrderSource.WEBSITE, externalId: dto.externalId } } });
        return { duplicate: true, order: await this.get(order.id) };
      }
      throw e;
    }
  }

  /** Pass `user` to apply the driver rule: drivers only see orders assigned to them. */
  async get(id: string, user?: AuthUser) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new NotFoundException('Order not found');
    if (user) assertCanSee(user, order);
    const all = await this.locations.withPaths();
    const byId = new Map(all.map((l) => [l.id, l]));
    const allocations = order.allocations.map((a) => {
      const loc = byId.get(a.locationId);
      return { ...a, path: loc?.path ?? '?', site: loc?.pathNames[0] ?? '?', locationCode: loc?.code ?? '' };
    });
    const loaded = allocations.reduce((s, a) => s + inTransitOf(a), 0);
    return {
      ...order,
      allocations,
      needs: needsOf(order).map((n) => ({
        ...n,
        allocated: allocations.filter((a) => a.lineId === n.lineId && a.variantId === n.variantId).reduce((s, a) => s + a.quantity, 0),
        picked: allocations.filter((a) => a.lineId === n.lineId && a.variantId === n.variantId).reduce((s, a) => s + a.picked, 0),
      })),
      /** Units still In Transit for this order. */
      inTransit: loaded,
      awaitingReturn: RETURNABLE.includes(order.status) && loaded > 0,
    };
  }

  async list(query: ListOrdersQuery, user: AuthUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const q = query.q?.trim();
    const where: Prisma.OrderWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.open && { status: { in: OPEN_STATUSES } }),
      ...(query.deliveredSince && { status: OrderStatus.DELIVERED, deliveredAt: { gte: new Date(query.deliveredSince) } }),
      // Drivers only ever see their own deliveries.
      ...(user.role === Role.DRIVER ? { driverId: user.id } : query.driverId ? { driverId: query.driverId } : {}),
      ...(q && {
        OR: [
          { orderNumber: { contains: q, mode: 'insensitive' } },
          { externalId: { contains: q, mode: 'insensitive' } },
          { customerName: { contains: q, mode: 'insensitive' } },
          { customerPhone: { contains: q } },
        ],
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: query.open ? [{ deliveryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }] : { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          driver: { select: { id: true, name: true } },
          _count: { select: { lines: true } },
          allocations: { select: { locationId: true, quantity: true, picked: true, released: true, delivered: true, returned: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    // Where the driver still has to collect from, and how much is on the van.
    const sites = new Map((await this.locations.withPaths()).map((l) => [l.id, l.pathNames[0]]));
    const items = rows.map(({ allocations, ...o }) => {
      const pickups = new Map<string, number>();
      for (const a of allocations) {
        const left = a.quantity - a.picked - a.released;
        if (left > 0) pickups.set(sites.get(a.locationId) ?? '?', (pickups.get(sites.get(a.locationId) ?? '?') ?? 0) + left);
      }
      return {
        ...o,
        pickups: [...pickups].map(([site, items]) => ({ site, items })),
        inTransit: allocations.reduce((s, a) => s + inTransitOf(a), 0),
      };
    });
    return { items, total, page, pageSize };
  }

  async update(user: AuthUser, id: string, dto: UpdateOrderDto) {
    const order = await this.mustBe(id, EDITABLE);
    await this.prisma.order.update({
      where: { id },
      data: { ...details(dto), ...(dto.customerName && { customerName: dto.customerName.trim() }) },
    });
    await this.audit.log({ userId: user.id, action: 'ORDER_UPDATED', entity: 'Order', entityId: id, data: { orderNumber: order.orderNumber, changes: { ...dto } } });
    return this.get(id);
  }

  // ---------------------------------------------------------------- allocation

  /** Where the system would take each item from (not saved). */
  async suggest(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new NotFoundException('Order not found');
    const needs = needsOf(order);
    const sources = await this.sources(needs.map((n) => n.variantId));
    const { allocations, short } = suggestAllocation(needs, sources);
    const where = new Map(sources.map((s) => [s.locationId, s]));
    return {
      allocations: allocations.map((a) => ({ ...a, path: where.get(a.locationId)?.path, site: where.get(a.locationId)?.site })),
      short,
      needs,
      /** Every place each needed item is free, so the manager can change the suggestion. */
      sources,
    };
  }

  /** Confirms the allocation: reserves the stock at those locations. */
  async allocate(user: AuthUser, id: string, dto: AllocateDto) {
    await this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, id, user);
      if (order.status !== OrderStatus.NEW) throw new BadRequestException(`${order.orderNumber} is already ${order.status.toLowerCase()}`);
      const needs = needsOf(order);
      const problem = allocationProblem(needs, dto.allocations);
      if (problem) throw new BadRequestException(problem);

      const merged = new Map<string, { lineId: string; variantId: string; locationId: string; quantity: number }>();
      for (const a of dto.allocations) {
        const key = `${a.lineId}:${a.variantId}:${a.locationId}`;
        const m = merged.get(key);
        if (m) m.quantity += a.quantity;
        else merged.set(key, { ...a });
      }
      await this.stock.apply(
        user.id,
        [...merged.values()].map((a) => ({ type: MovementType.RESERVE, variantId: a.variantId, quantity: a.quantity, fromLocationId: a.locationId, reference: order.orderNumber })),
        tx,
      );
      await tx.orderAllocation.createMany({ data: [...merged.values()].map((a) => ({ ...a, orderId: id })) });
      await tx.order.update({ where: { id }, data: { status: OrderStatus.ALLOCATED } });
      await this.audit.log({ userId: user.id, action: 'ORDER_ALLOCATED', entity: 'Order', entityId: id, data: { orderNumber: order.orderNumber, allocations: merged.size } }, tx);
    });
    return this.get(id);
  }

  /** Gives the reservations back so the allocation can be redone (only before picking starts). */
  async unallocate(user: AuthUser, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, id, user);
      if (order.status !== OrderStatus.ALLOCATED) throw new BadRequestException('Only an allocated order that has not been picked can be re-allocated');
      await this.stock.apply(
        user.id,
        order.allocations.map((a) => ({ type: MovementType.RELEASE, variantId: a.variantId, quantity: a.quantity, fromLocationId: a.locationId, reference: order.orderNumber })),
        tx,
      );
      await tx.orderAllocation.deleteMany({ where: { orderId: id } });
      await tx.order.update({ where: { id }, data: { status: OrderStatus.NEW } });
      await this.audit.log({ userId: user.id, action: 'ORDER_UNALLOCATED', entity: 'Order', entityId: id, data: { orderNumber: order.orderNumber } }, tx);
    });
    return this.get(id);
  }

  // ---------------------------------------------------------------- picking

  /**
   * One scan = one unit picked and loaded (reserved → In Transit). Checks the right item / box,
   * the right location and not more than ordered. A different location needs a manager.
   */
  async pick(user: AuthUser, id: string, dto: PickDto) {
    await this.sites.assert(user, [dto.locationId]);
    try {
      return await this.pickOnce(user, id, dto);
    } catch (e) {
      // Wrong item / box / place or too many: keep a record for the picking-errors report.
      // (Logged outside the failed transaction, which rolls back.)
      if (e instanceof BadRequestException || e instanceof ConflictException || e instanceof NotFoundException) {
        const order = await this.prisma.order.findUnique({ where: { id }, select: { orderNumber: true, driverId: true } });
        if (order && (user.role !== Role.DRIVER || order.driverId === user.id)) {
          const response = e.getResponse();
          await this.audit.log({
            userId: user.id,
            action: 'PICK_REJECTED',
            entity: 'Order',
            entityId: id,
            data: {
              orderNumber: order.orderNumber,
              code: dto.code.trim(),
              locationId: dto.locationId,
              reason: pickErrorReason(e, response),
              message: e.message,
            },
          });
        }
      }
      throw e;
    }
  }

  private async pickOnce(user: AuthUser, id: string, dto: PickDto) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const order = await lockOrder(tx, id, user);
        if (!PICKABLE.includes(order.status)) throw new BadRequestException(`${order.orderNumber} is ${order.status.toLowerCase()} — nothing to pick`);

        const barcode = await tx.barcode.findFirst({ where: { code: dto.code.trim(), active: true }, include: { variant: { select: variantSelect } } });
        if (!barcode) throw new NotFoundException(`Unknown code "${dto.code.trim()}"`);
        const v = barcode.variant;
        const name = itemName(v);
        const forItem = order.allocations.filter((a) => a.variantId === v.id);
        if (!forItem.length) {
          throw new BadRequestException(v.kind === VariantKind.COMPONENT ? `Wrong box: ${name} is not part of this order` : `Wrong item: ${name} is not on this order`);
        }
        const open = forItem.filter((a) => a.picked + a.released < a.quantity);
        if (!open.length) {
          const total = forItem.reduce((s, a) => s + a.picked, 0);
          throw new ConflictException({ code: 'ALREADY_PICKED', message: `All ${total} × ${name} already picked` });
        }

        const transitId = await this.stock.transitLocationId(tx);
        const paths = new Map((await this.locations.withPaths()).map((l) => [l.id, l.path]));
        const here = open.find((a) => a.locationId === dto.locationId);
        let override: { approverId: string; from: string } | null = null;

        if (here) {
          await this.stock.apply(user.id, [{ type: MovementType.LOAD, variantId: v.id, quantity: 1, fromLocationId: here.locationId, toLocationId: transitId, reference: order.orderNumber }], tx);
          await tx.orderAllocation.update({ where: { id: here.id }, data: { picked: { increment: 1 } } });
        } else {
          const expected = [...new Set(open.map((a) => paths.get(a.locationId) ?? '?'))].join(' or ');
          if (!dto.approval) {
            throw new ConflictException({ code: 'WRONG_LOCATION', message: `Wrong location: ${name} should be picked from ${expected}`, expected });
          }
          if (!dto.reason?.trim()) throw new BadRequestException('Give a reason for picking from a different location');
          const approverId = await verifyApprover(this.prisma, dto.approval);
          const from = open[0];
          // Move the reservation to where it was actually found, then load from there.
          await this.stock.apply(
            user.id,
            [
              { type: MovementType.RELEASE, variantId: v.id, quantity: 1, fromLocationId: from.locationId, reference: order.orderNumber },
              { type: MovementType.RESERVE, variantId: v.id, quantity: 1, fromLocationId: dto.locationId, reference: order.orderNumber },
              { type: MovementType.LOAD, variantId: v.id, quantity: 1, fromLocationId: dto.locationId, toLocationId: transitId, reference: order.orderNumber, reason: 'Picked from a different location', note: dto.reason },
            ],
            tx,
          );
          if (from.quantity === 1 && from.picked === 0 && from.released === 0) await tx.orderAllocation.delete({ where: { id: from.id } });
          else await tx.orderAllocation.update({ where: { id: from.id }, data: { quantity: { decrement: 1 } } });
          const existing = order.allocations.find((a) => a.lineId === from.lineId && a.variantId === v.id && a.locationId === dto.locationId);
          if (existing) await tx.orderAllocation.update({ where: { id: existing.id }, data: { quantity: { increment: 1 }, picked: { increment: 1 } } });
          else await tx.orderAllocation.create({ data: { orderId: id, lineId: from.lineId, variantId: v.id, locationId: dto.locationId, quantity: 1, picked: 1 } });
          override = { approverId, from: paths.get(from.locationId) ?? '?' };
          await this.audit.log(
            {
              userId: user.id,
              action: 'PICK_LOCATION_OVERRIDE',
              entity: 'Order',
              entityId: id,
              data: { orderNumber: order.orderNumber, item: name, expectedFrom: override.from, pickedFrom: paths.get(dto.locationId) ?? '?', approvedById: approverId, reason: dto.reason },
            },
            tx,
          );
        }

        await this.refreshPickStatus(tx, id);
        const left = (await tx.orderAllocation.findMany({ where: { orderId: id, variantId: v.id } })).reduce((s, a) => s + a.quantity - a.picked - a.released, 0);
        return { item: name, from: paths.get(dto.locationId) ?? '?', leftOfThisItem: left, override: !!override };
      },
      { timeout: 20_000 },
    );
    return { ...result, order: await this.get(id) };
  }

  /** Manager override: finish with some items/boxes not picked (their reservations are released). */
  async shortPick(user: AuthUser, id: string, dto: ShortPickDto) {
    const approverId = await verifyApprover(this.prisma, dto.approval);
    await this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, id, user);
      if (!PICKABLE.includes(order.status)) throw new BadRequestException(`${order.orderNumber} is ${order.status.toLowerCase()}`);
      if (!order.allocations.some((a) => a.picked > 0)) throw new BadRequestException('Nothing has been picked — cancel the order instead');
      const missing = await this.releaseUnpicked(tx, user.id, order, 'Approved as missing');
      await tx.order.update({ where: { id }, data: { status: OrderStatus.LOADED, shortReason: dto.reason.trim(), shortApprovedById: approverId } });
      await this.audit.log(
        { userId: user.id, action: 'ORDER_SHORT_APPROVED', entity: 'Order', entityId: id, data: { orderNumber: order.orderNumber, missing, approvedById: approverId, reason: dto.reason } },
        tx,
      );
    });
    return this.get(id);
  }

  /** Releases reservations. Anything already loaded stays In Transit until scanned back (returnScan). */
  async cancel(user: AuthUser, id: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, id, user);
      if (!CANCELLABLE.includes(order.status)) throw new BadRequestException(`${order.orderNumber} is ${order.status.toLowerCase()} and can't be cancelled`);
      await this.releaseUnpicked(tx, user.id, order, 'Order cancelled');
      await tx.order.update({ where: { id }, data: { status: OrderStatus.CANCELLED, cancelReason: reason.trim() } });
      await this.audit.log({ userId: user.id, action: 'ORDER_CANCELLED', entity: 'Order', entityId: id, data: { orderNumber: order.orderNumber, reason } }, tx);
    });
    return this.get(id);
  }

  /**
   * Scans a unit still on the van back into stock (Good → a space, Damaged → Damaged): after a
   * cancellation, a failed delivery, or the part of a delivery the customer didn't take.
   */
  async returnScan(user: AuthUser, id: string, dto: ReturnScanDto) {
    if (dto.condition === ReturnCondition.GOOD) await this.sites.assert(user, [dto.locationId]);
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, id, user);
      if (!RETURNABLE.includes(order.status)) {
        throw new BadRequestException(`${order.orderNumber} is ${order.status.toLowerCase()} — returns are for cancelled, failed or partly delivered orders`);
      }
      const barcode = await tx.barcode.findFirst({ where: { code: dto.code.trim(), active: true }, include: { variant: { select: variantSelect } } });
      if (!barcode) throw new NotFoundException(`Unknown code "${dto.code.trim()}"`);
      const name = itemName(barcode.variant);
      const alloc = order.allocations.find((a) => a.variantId === barcode.variantId && inTransitOf(a) > 0);
      if (!alloc) throw new BadRequestException(`No loaded ${name} left to return on this order`);
      const to = dto.condition === ReturnCondition.DAMAGED ? await this.stock.damagedLocationId(tx) : dto.locationId;
      if (!to) throw new BadRequestException('Choose where the item goes back to');

      await this.stock.apply(
        user.id,
        [
          {
            type: MovementType.RETURN,
            variantId: barcode.variantId,
            quantity: 1,
            fromLocationId: await this.stock.transitLocationId(tx),
            toLocationId: to,
            reference: order.orderNumber,
            reason: dto.condition === ReturnCondition.DAMAGED ? 'Returned damaged' : `Returned (${order.status.toLowerCase()} order)`,
          },
        ],
        tx,
      );
      await tx.orderAllocation.update({ where: { id: alloc.id }, data: { returned: { increment: 1 } } });
      const remaining = order.allocations.reduce((s, a) => s + inTransitOf(a), 0) - 1;
      if (remaining === 0 && order.status === OrderStatus.FAILED) await tx.order.update({ where: { id }, data: { status: OrderStatus.RETURNED } });
      await this.audit.log({ userId: user.id, action: 'ORDER_ITEM_RETURNED', entity: 'Order', entityId: id, data: { orderNumber: order.orderNumber, item: name, condition: dto.condition } }, tx);
      return { item: name, remaining };
    });
    return { ...result, order: await this.get(id) };
  }

  // ---------------------------------------------------------------- helpers

  private async mustBe(id: string, statuses: OrderStatus[]) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (!statuses.includes(order.status)) throw new BadRequestException(`${order.orderNumber} is ${order.status.toLowerCase()}`);
    return order;
  }

  private async refreshPickStatus(tx: Tx, id: string) {
    const allocations = await tx.orderAllocation.findMany({ where: { orderId: id } });
    const done = allocations.every((a) => a.picked + a.released >= a.quantity);
    await tx.order.update({ where: { id }, data: { status: done ? OrderStatus.LOADED : OrderStatus.PICKING } });
  }

  private async releaseUnpicked(tx: Tx, userId: string, order: OrderWithLines, reason: string) {
    const moves: MoveInput[] = [];
    let missing = 0;
    for (const a of order.allocations) {
      const open = a.quantity - a.picked - a.released;
      if (open <= 0) continue;
      missing += open;
      moves.push({ type: MovementType.RELEASE, variantId: a.variantId, quantity: open, fromLocationId: a.locationId, reference: order.orderNumber, reason });
      await tx.orderAllocation.update({ where: { id: a.id }, data: { released: { increment: open } } });
    }
    await this.stock.apply(userId, moves, tx);
    return missing;
  }

  /** Free stock for these variants in real, visible locations. */
  private async sources(variantIds: string[]) {
    const levels = await this.prisma.stockLevel.findMany({ where: { variantId: { in: [...new Set(variantIds)] } } });
    const all = new Map((await this.locations.withPaths()).map((l) => [l.id, l]));
    return levels
      .map((l) => ({ l, loc: all.get(l.locationId)! }))
      .filter(({ l, loc }) => loc && loc.active && !SYSTEM.includes(loc.type) && l.onHand - l.reserved > 0)
      .map(({ l, loc }) => ({ variantId: l.variantId, locationId: l.locationId, site: loc.pathNames[0], path: loc.path, available: l.onHand - l.reserved }));
  }
}

/** What each line needs reserved: the variant itself, or every box of a kit. */
function needsOf(order: OrderWithLines): (Need & { name: string })[] {
  return order.lines.flatMap((line) =>
    line.variant.kind === VariantKind.KIT
      ? line.variant.components.map((c) => ({
          lineId: line.id,
          variantId: c.componentVariant.id,
          quantity: c.quantity * line.quantity,
          name: `${line.description}, ${c.componentVariant.name.split(' – ')[0]}`,
        }))
      : [{ lineId: line.id, variantId: line.variantId, quantity: line.quantity, name: line.description }],
  );
}

function details(dto: UpdateOrderDto) {
  return {
    customerPhone: dto.customerPhone?.trim() || undefined,
    address: dto.address?.trim() || undefined,
    latitude: dto.latitude,
    longitude: dto.longitude,
    notes: dto.notes?.trim() || undefined,
    paymentStatus: dto.paymentStatus,
    codAmount: dto.codAmount,
    deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
    timeWindow: dto.timeWindow?.trim() || undefined,
  };
}
