import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, StreamableFile } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { POS, SALES_READ } from '../auth/role-groups.js';
import { DocumentsService } from './documents.service.js';
import { CreateSaleDto, ListSalesQuery, PreviewSaleDto, SummaryQuery } from './dto/sale.dto.js';
import { SalesService } from './sales.service.js';

@Controller('sales')
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly documents: DocumentsService,
  ) {}

  /** Cart totals, priced exactly as the sale will be. */
  @Roles(...POS)
  @Post('preview')
  @HttpCode(200)
  preview(@CurrentUser() user: AuthUser, @Body() dto: PreviewSaleDto) {
    return this.sales.preview(user, dto.lines);
  }

  @Roles(...POS)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleDto) {
    return this.sales.create(user, dto);
  }

  @Roles(...SALES_READ)
  @Get()
  list(@Query() query: ListSalesQuery) {
    return this.sales.list(query);
  }

  /** GET /sales/summary?from=…&to=… (ISO date-times) */
  @Roles(...SALES_READ)
  @Get('summary')
  summary(@Query() query: SummaryQuery) {
    return this.sales.summary(new Date(query.from), new Date(query.to));
  }

  /** GET /sales/by-number/INV-000012 */
  @Roles(...SALES_READ)
  @Get('by-number/:invoice')
  byNumber(@Param('invoice') invoice: string) {
    return this.sales.findByNumber(invoice);
  }

  @Roles(...SALES_READ)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.sales.get(id);
  }

  @Roles(...SALES_READ)
  @Get(':id/invoice')
  async invoice(@Param('id', ParseUUIDPipe) id: string) {
    const sale = await this.sales.get(id);
    return new StreamableFile(await this.documents.invoicePdf(id), {
      type: 'application/pdf',
      disposition: `inline; filename="${sale.invoiceNumber}.pdf"`,
    });
  }

  @Roles(...SALES_READ)
  @Get(':id/receipt')
  async receipt(@Param('id', ParseUUIDPipe) id: string) {
    const sale = await this.sales.get(id);
    return new StreamableFile(await this.documents.receiptPdf(id), {
      type: 'application/pdf',
      disposition: `inline; filename="receipt-${sale.invoiceNumber}.pdf"`,
    });
  }
}
