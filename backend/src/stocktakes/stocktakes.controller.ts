import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { STOCK_ADJUST, STOCK_READ, STOCK_WRITE } from '../auth/role-groups.js';
import { CountDto, CreateStocktakeDto, ListStocktakesQuery, SubmitStocktakeDto } from './dto/stocktake.dto.js';
import { StocktakesService } from './stocktakes.service.js';

/** Anyone who handles stock can count; only admins/managers approve the corrections. */
@Controller('stocktakes')
export class StocktakesController {
  constructor(private readonly stocktakes: StocktakesService) {}

  @Roles(...STOCK_READ)
  @Get()
  list(@Query() query: ListStocktakesQuery) {
    return this.stocktakes.list(query);
  }

  @Roles(...STOCK_READ)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.stocktakes.get(id);
  }

  @Roles(...STOCK_WRITE)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStocktakeDto) {
    return this.stocktakes.create(user, dto);
  }

  @Roles(...STOCK_WRITE)
  @Put(':id/counts')
  count(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CountDto) {
    return this.stocktakes.count(user, id, dto);
  }

  @Roles(...STOCK_WRITE)
  @Post(':id/submit')
  @HttpCode(200)
  submit(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitStocktakeDto) {
    return this.stocktakes.submit(user, id, dto.uncountedAsZero ?? false);
  }

  @Roles(...STOCK_ADJUST)
  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.stocktakes.approve(user, id);
  }

  @Roles(...STOCK_ADJUST)
  @Post(':id/reopen')
  @HttpCode(200)
  reopen(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.stocktakes.reopen(user, id);
  }

  @Roles(...STOCK_ADJUST)
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.stocktakes.cancel(user, id);
  }
}
