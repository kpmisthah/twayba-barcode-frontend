import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { DELIVERY, ORDER_READ, ORDER_WRITE, STOCK_WRITE } from '../auth/role-groups.js';
import { DeliveriesService } from './deliveries.service.js';
import {
  AllocateDto,
  AssignDriverDto,
  CancelOrderDto,
  CreateOrderDto,
  DeliverDto,
  FailDeliveryDto,
  ListOrdersQuery,
  PickDto,
  ReportExceptionDto,
  ReturnScanDto,
  ShortPickDto,
  UpdateOrderDto,
} from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

/** Admins/managers create and allocate orders; anyone who handles stock picks and returns. */
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly deliveries: DeliveriesService,
  ) {}

  /** Drivers always get only their own orders. */
  @Roles(...ORDER_READ)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListOrdersQuery) {
    return this.orders.list(query, user);
  }

  @Roles(...ORDER_WRITE)
  @Get('drivers')
  drivers() {
    return this.deliveries.drivers();
  }

  @Roles(...ORDER_READ)
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(id, user);
  }

  @Roles(...ORDER_WRITE)
  @Patch(':id/driver')
  assignDriver(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDriverDto) {
    return this.deliveries.assignDriver(user, id, dto);
  }

  @Roles(...DELIVERY)
  @Post(':id/start')
  @HttpCode(200)
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.deliveries.start(user, id);
  }

  @Roles(...DELIVERY)
  @Post(':id/deliver')
  @HttpCode(200)
  deliver(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeliverDto) {
    return this.deliveries.deliver(user, id, dto);
  }

  @Roles(...DELIVERY)
  @Post(':id/fail')
  @HttpCode(200)
  fail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FailDeliveryDto) {
    return this.deliveries.fail(user, id, dto);
  }

  @Roles(...STOCK_WRITE)
  @Post(':id/exceptions')
  reportException(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReportExceptionDto) {
    return this.deliveries.reportException(user, id, dto);
  }

  @Roles(...ORDER_WRITE)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user, dto);
  }

  @Roles(...ORDER_WRITE)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderDto) {
    return this.orders.update(user, id, dto);
  }

  @Roles(...ORDER_WRITE)
  @Get(':id/suggestion')
  suggest(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.suggest(id);
  }

  @Roles(...ORDER_WRITE)
  @Post(':id/allocate')
  @HttpCode(200)
  allocate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AllocateDto) {
    return this.orders.allocate(user, id, dto);
  }

  @Roles(...ORDER_WRITE)
  @Post(':id/unallocate')
  @HttpCode(200)
  unallocate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.unallocate(user, id);
  }

  @Roles(...STOCK_WRITE)
  @Post(':id/pick')
  @HttpCode(200)
  pick(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PickDto) {
    return this.orders.pick(user, id, dto);
  }

  /** The approval inside the body is what authorises this; anyone picking can ask for it. */
  @Roles(...STOCK_WRITE)
  @Post(':id/short')
  @HttpCode(200)
  shortPick(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ShortPickDto) {
    return this.orders.shortPick(user, id, dto);
  }

  @Roles(...ORDER_WRITE)
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto) {
    return this.orders.cancel(user, id, dto.reason);
  }

  @Roles(...STOCK_WRITE)
  @Post(':id/return-scan')
  @HttpCode(200)
  returnScan(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnScanDto) {
    return this.orders.returnScan(user, id, dto);
  }
}
