import { Controller, Get } from '@nestjs/common';
import { ImportIssueStatus, LocationType, OrderStatus, ProductStatus, Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { DASHBOARD, SALES_READ } from '../auth/role-groups.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StockQueryService } from '../stock/stock-query.service.js';
import { dayRange, maltaDay } from './dates.js';

/** The numbers on the dashboard (spec §11). Sales figures only for roles that may see sales. */
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockQueryService,
  ) {}

  @Roles(...DASHBOARD)
  @Get()
  async get(@CurrentUser() user: AuthUser) {
    const today = dayRange(maltaDay(new Date()), maltaDay(new Date()));
    const canSeeSales = (SALES_READ as readonly Role[]).includes(user.role);
    const [products, stock, low, orderCounts, recent, sales, returns] = await Promise.all([
      this.prisma.product.count({ where: { status: ProductStatus.ACTIVE } }),
      this.prisma.stockLevel.aggregate({ where: { location: { type: { notIn: [LocationType.TRANSIT, LocationType.DAMAGED] } } }, _sum: { onHand: true } }),
      this.stock.lowStock(),
      this.prisma.order.groupBy({ by: ['status'], _count: true }),
      this.prisma.stockMovement.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: { user: { select: { name: true } }, variant: { select: { code: true, name: true, product: { select: { id: true, name: true } } } } },
      }),
      canSeeSales ? this.prisma.sale.aggregate({ where: { createdAt: today }, _count: true, _sum: { total: true } }) : null,
      canSeeSales ? this.prisma.creditNote.aggregate({ where: { createdAt: today }, _count: true, _sum: { total: true } }) : null,
    ]);
    const count = (...statuses: OrderStatus[]) => orderCounts.filter((o) => statuses.includes(o.status)).reduce((s, o) => s + o._count, 0);
    const [ordersToday, websiteIssues] = await Promise.all([
      this.prisma.order.count({ where: { createdAt: today } }),
      this.prisma.importIssue.count({ where: { status: ImportIssueStatus.OPEN } }),
    ]);
    return {
      products,
      stockUnits: stock._sum.onHand ?? 0,
      lowStock: low.length,
      lowStockTop: low.slice(0, 3),
      orders: {
        today: ordersToday,
        pending: count(OrderStatus.NEW, OrderStatus.ALLOCATED, OrderStatus.PICKING),
        readyForDelivery: count(OrderStatus.LOADED),
        outForDelivery: count(OrderStatus.OUT_FOR_DELIVERY),
        failed: count(OrderStatus.FAILED),
      },
      /** Website orders that could not be imported and need someone to look. */
      websiteIssues,
      sales: sales && { count: sales._count, total: (sales._sum.total ?? 0).toString() },
      returns: returns && { count: returns._count, total: (returns._sum.total ?? 0).toString() },
      recentMovements: recent,
    };
  }
}
