import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CATALOG_WRITE, STAFF_READ } from '../auth/role-groups.js';
import {
  AddBarcodeDto,
  CreateProductDto,
  ListProductsQuery,
  NewComponentDto,
  NewVariantDto,
  SetActiveDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './dto/product.dto.js';
import { ProductsService } from './products.service.js';

@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Roles(...STAFF_READ)
  @Get('products')
  async list(@CurrentUser() user: AuthUser, @Query() query: ListProductsQuery) {
    return hideCost(user, await this.products.list(query));
  }

  @Roles(...STAFF_READ)
  @Get('products/:id')
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return hideCost(user, await this.products.get(id));
  }

  @Roles(...CATALOG_WRITE)
  @Post('products')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.products.create(user.id, dto);
  }

  @Roles(...CATALOG_WRITE)
  @Patch('products/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user.id, id, dto);
  }

  @Roles(...CATALOG_WRITE)
  @Post('products/:id/variants')
  addVariant(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NewVariantDto,
  ) {
    return this.products.addVariant(user.id, id, dto);
  }

  @Roles(...CATALOG_WRITE)
  @Post('products/:id/components')
  addComponent(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NewComponentDto,
  ) {
    return this.products.addComponent(user.id, id, dto);
  }

  @Roles(...CATALOG_WRITE)
  @Patch('variants/:id')
  updateVariant(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.products.updateVariant(user.id, id, dto);
  }

  @Roles(...CATALOG_WRITE)
  @Post('variants/:id/barcodes')
  addBarcode(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddBarcodeDto,
  ) {
    return this.products.addBarcode(user.id, id, dto.code);
  }

  @Roles(...CATALOG_WRITE)
  @Patch('barcodes/:id')
  setBarcodeActive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetActiveDto,
  ) {
    return this.products.setBarcodeActive(user.id, id, dto.active);
  }

  /** Scanner lookup: what item is this code? */
  @Roles(...STAFF_READ)
  @Get('barcodes/lookup/:code')
  async lookup(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return hideCost(user, await this.products.lookup(code));
  }
}

/** Cost prices are only for roles that manage the catalogue. */
function hideCost<T>(user: AuthUser, data: T): T {
  if ((CATALOG_WRITE as readonly string[]).includes(user.role)) return data;
  return JSON.parse(JSON.stringify(data), (key, value) => (key === 'costPrice' ? undefined : value));
}
