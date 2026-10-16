import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MovementType, OrderPayment, OrderStatus, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { APPROVER_ROLES, verifyApprover } from '../auth/approver.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StockService } from '../stock/stock.service.js';
import { AssignDriverDto, DeliverDto, FailDeliveryDto, ReportExceptionDto } from './dto/order.dto.js';
import { inTransitOf, lockOrder, OrdersService } from './orders.service.js';

/** Can't change the driver once the order is finished. */
const FINISHED: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.RETURNED, OrderStatus.CANCELLED];
const DELIVERABLE: OrderStatus[] = [OrderStatus.LOADED, OrderStatus.OUT_FOR_DELIVERY];

/**
 * The driver's side of an order: assign → out for delivery → delivered (the second scan /
 * confirmation, stock leaves In Transit) or failed (stays In Transit), plus exception reports.
 */
@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
    private readonly orders: OrdersService,
  ) {}

  /** Active users with the Driver role, for the "assign driver" list. */
  drivers() {
    return this.prisma.user.findMany({ where: { role: Role.DRIVER, active: true }, select: { id: true, name: true, phone: true }, orderBy: { name: 'asc' } });
  }

  async assignDriver(user: AuthUser, id: string, dto: AssignDriverDto) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (FINISHED.includes(order.status)) throw new BadRequestException(`${order.orderNumber} is ${order.status.toLowerCase()}`);
    if (dto.driverId) {
      const driver = await this.prisma.user.findUnique({ where: { id: dto.driverId } });
      if (!driver || !driver.active || driver.role !== Role.DRIVER) throw new BadRequestException('Choose an active driver');
    }
    await this.prisma.order.update({ where: { id }, data: { driverId: dto.driverId ?? null } });
    await this.audit.log({ userId: user.id, action: 'ORDER_DRIVER_ASSIGNED', entity: 'Order', entityId: id, data: { orderNumber: order.orderNumber, driverId: dto.driverId ?? null } });
    return this.orders.get(id);
  }

  /** The driver sets off (also used for a second attempt after a failed delivery). */
  async start(user: AuthUser, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, id, user);
      if (order.status !== OrderStatus.LOADED && order.status !== OrderStatus.FAILED) {
        throw new BadRequestException(`${order.orderNumber} is ${order.status.toLowerCase()} — load it first`);
      }
      if (!order.allocations.some((a) => inTransitOf(a) > 0)) throw new BadRequestException('Nothing is on the van for this order');
      await tx.order.update({ where: { id }, data: { status: OrderStatus.OUT_FOR_DELIVERY, startedAt: new Date(), failedReason: null } });
      await this.audit.log({ userId: user.id, action: 'DELIVERY_STARTED', entity: 'Order', entityId: id, data: { orderNumber: order.orderNumber, retry: order.status === OrderStatus.FAILED } }, tx);
    });
    return this.orders.get(id, user);
  }

  /**
   * Delivered: everything on the van leaves stock (DELIVER movements). For a partial delivery the
   * driver lists what the customer took; that needs an admin/manager, and the rest stays In
   * Transit until scanned back in.
   */
  async deliver(user: AuthUser, id: string, dto: DeliverDto) {
    await this.prisma.$transaction(
      async (tx) => {
        const order = await lockOrder(tx, id, user);
        if (!DELIVERABLE.includes(order.status)) throw new BadRequestException(`${order.orderNumber} is ${order.status.toLowerCase()} — it can't be delivered now`);

        const onVan = new Map<string, number>();
        for (const a of order.allocations) onVan.set(a.variantId, (onVan.get(a.variantId) ?? 0) + inTransitOf(a));
        const totalOnVan = [...onVan.values()].reduce((s, n) => s + n, 0);
        if (totalOnVan === 0) throw new BadRequestException('Nothing is on the van for this order');

        // What is being handed over, per item.
        const handing = new Map<string, number>();
        if (dto.items?.length) {
          for (const i of dto.items) handing.set(i.variantId, (handing.get(i.variantId) ?? 0) + i.quantity);
          for (const [variantId, n] of handing) {
            if (n > (onVan.get(variantId) ?? 0)) throw new BadRequestException(`Only ${onVan.get(variantId) ?? 0} of that item are on the van`);
          }
        } else {
          for (const [variantId, n] of onVan) if (n > 0) handing.set(variantId, n);
        }
        const handed = [...handing.values()].reduce((s, n) => s + n, 0);
        if (handed === 0) throw new BadRequestException('Nothing selected to deliver');
        const partial = handed < totalOnVan;

        let partialApprovedById: string | null = null;
        if (partial) {
          if (APPROVER_ROLES.includes(user.role)) partialApprovedById = user.id;
          else if (dto.approval) partialApprovedById = await verifyApprover(this.prisma, dto.approval);
          else throw new BadRequestException('Delivering only part of the order needs a manager’s approval');
          if (!dto.note?.trim()) throw new BadRequestException('Say why only part of the order was delivered');
        }
        if (order.paymentStatus === OrderPayment.COD && dto.codCollected === undefined) {
          throw new BadRequestException('Enter the cash collected for this cash-on-delivery order');
        }

        // Spread the delivered units over the allocations they were loaded from.
        const transitId = await this.stock.transitLocationId(tx);
        const left = new Map(handing);
        for (const a of order.allocations) {
          const want = left.get(a.variantId) ?? 0;
          const take = Math.min(want, inTransitOf(a));
          if (take <= 0) continue;
          await tx.orderAllocation.update({ where: { id: a.id }, data: { delivered: { increment: take } } });
          left.set(a.variantId, want - take);
        }
        await this.stock.apply(
          user.id,
          [...handing].map(([variantId, quantity]) => ({ type: MovementType.DELIVER, variantId, quantity, fromLocationId: transitId, reference: order.orderNumber })),
          tx,
        );

        await tx.order.update({
          where: { id },
          data: {
            status: OrderStatus.DELIVERED,
            deliveredAt: new Date(),
            deliveredById: user.id,
            recipientName: dto.recipientName?.trim() || null,
            codCollected: dto.codCollected ?? null,
            deliveryNote: dto.note?.trim() || null,
            deliveryPhotoUrl: dto.photoUrl ?? null,
            partialApprovedById,
          },
        });
        await this.audit.log(
          {
            userId: user.id,
            action: partial ? 'ORDER_DELIVERED_PARTIAL' : 'ORDER_DELIVERED',
            entity: 'Order',
            entityId: id,
            data: {
              orderNumber: order.orderNumber,
              delivered: handed,
              notDelivered: totalOnVan - handed,
              codExpected: order.codAmount?.toString() ?? null,
              codCollected: dto.codCollected ?? null,
              partialApprovedById,
            },
          },
          tx,
        );
      },
      { timeout: 20_000 },
    );
    return this.orders.get(id, user);
  }

  /** Couldn't deliver: the goods stay In Transit until delivered again or scanned back in. */
  async fail(user: AuthUser, id: string, dto: FailDeliveryDto) {
    await this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, id, user);
      if (!DELIVERABLE.includes(order.status)) throw new BadRequestException(`${order.orderNumber} is ${order.status.toLowerCase()}`);
      await tx.order.update({ where: { id }, data: { status: OrderStatus.FAILED, failedReason: dto.reason } });
      await tx.deliveryException.create({ data: { orderId: id, type: dto.reason, note: dto.note.trim(), photoUrl: dto.photoUrl ?? null, reportedById: user.id } });
      await this.audit.log({ userId: user.id, action: 'DELIVERY_FAILED', entity: 'Order', entityId: id, data: { orderNumber: order.orderNumber, reason: dto.reason, note: dto.note } }, tx);
    });
    return this.orders.get(id, user);
  }

  /** Missing / damaged box or any other problem, with notes and an optional photo. */
  async reportException(user: AuthUser, id: string, dto: ReportExceptionDto) {
    const order = await this.orders.get(id, user);
    if (dto.variantId && !order.allocations.some((a) => a.variantId === dto.variantId)) {
      throw new BadRequestException('That item is not on this order');
    }
    if (dto.locationId && !(await this.prisma.location.findUnique({ where: { id: dto.locationId }, select: { id: true } }))) {
      throw new BadRequestException('Location not found');
    }
    await this.prisma.deliveryException.create({
      data: {
        orderId: id,
        type: dto.type,
        variantId: dto.variantId ?? null,
        locationId: dto.locationId ?? null,
        note: dto.note.trim(),
        photoUrl: dto.photoUrl ?? null,
        reportedById: user.id,
      },
    });
    await this.audit.log({ userId: user.id, action: 'DELIVERY_EXCEPTION', entity: 'Order', entityId: id, data: { orderNumber: order.orderNumber, type: dto.type, note: dto.note } });
    return this.orders.get(id, user);
  }
}
