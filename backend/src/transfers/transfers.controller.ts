import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { STOCK_ADJUST, STOCK_READ, STOCK_WRITE } from '../auth/role-groups.js';
import { CloseTransferDto, ListTransfersQuery, ReceiveTransferDto, SendTransferDto } from './dto/transfer.dto.js';
import { TransfersService } from './transfers.service.js';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Roles(...STOCK_READ)
  @Get()
  list(@Query() query: ListTransfersQuery) {
    return this.transfers.list(query);
  }

  @Roles(...STOCK_READ)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.get(id);
  }

  @Roles(...STOCK_WRITE)
  @Post()
  send(@CurrentUser() user: AuthUser, @Body() dto: SendTransferDto) {
    return this.transfers.send(user, dto);
  }

  @Roles(...STOCK_WRITE)
  @Post(':id/receive')
  @HttpCode(200)
  receive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceiveTransferDto) {
    return this.transfers.receive(user, id, dto);
  }

  @Roles(...STOCK_ADJUST)
  @Post(':id/close')
  @HttpCode(200)
  close(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseTransferDto) {
    return this.transfers.closeMissing(user, id, dto.reason);
  }

  @Roles(...STOCK_WRITE)
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseTransferDto) {
    return this.transfers.cancel(user, id, dto.reason);
  }
}
