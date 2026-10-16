import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { MovementType } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { STOCK_ADJUST, STOCK_READ, STOCK_WRITE } from '../auth/role-groups.js';
import { SiteAccessService } from '../locations/site-access.service.js';
import { ListMovementsQuery, ManualMovementDto } from './dto/stock.dto.js';
import { StockQueryService } from './stock-query.service.js';
import { StockService } from './stock.service.js';

@Controller('stock')
export class StockController {
  constructor(
    private readonly stock: StockService,
    private readonly query: StockQueryService,
    private readonly sites: SiteAccessService,
  ) {}

  @Roles(...STOCK_READ)
  @Get('products/:id')
  productStock(@Param('id', ParseUUIDPipe) id: string) {
    return this.query.productStock(id);
  }

  @Roles(...STOCK_READ)
  @Get('low')
  lowStock() {
    return this.query.lowStock();
  }

  @Roles(...STOCK_READ)
  @Get('locations/:id')
  locationStock(@Param('id', ParseUUIDPipe) id: string) {
    return this.query.locationStock(id);
  }

  @Roles(...STOCK_READ)
  @Get('movements')
  movements(@Query() query: ListMovementsQuery) {
    return this.query.movements(query);
  }

  /** Returns the movements written: one, or one per box for a whole kit. */
  @Roles(...STOCK_WRITE)
  @Post('movements')
  async record(@CurrentUser() user: AuthUser, @Body() dto: ManualMovementDto) {
    if (dto.type === MovementType.ADJUSTMENT && !(STOCK_ADJUST as readonly string[]).includes(user.role)) {
      throw new ForbiddenException('Only admins and managers can make stock corrections');
    }
    await this.sites.assert(user, [dto.fromLocationId, dto.toLocationId]);
    return this.stock.recordManual(user.id, dto);
  }
}
