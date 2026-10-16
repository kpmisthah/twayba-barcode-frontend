import { BadRequestException, Controller, Get, HttpCode, Post, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CATALOG_WRITE, STOCK_ADJUST } from '../auth/role-groups.js';
import { ImportsService } from './imports.service.js';
import { templateXlsx } from './sheet.js';

const upload = FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Upload once without `commit=true` to check; then again with it to save. */
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Roles(...CATALOG_WRITE)
  @Get('products/template')
  async productTemplate() {
    const file = await templateXlsx(
      'Products',
      'One row per item. Rows with the same Product name become one product with several colours/sizes. Leave SKU empty to have one generated. Multi-box kits are added in the app.',
      ['Product name *', 'Colour', 'Size', 'SKU', 'Supplier barcode', 'Category', 'Brand', 'Price *', 'Cost price', 'VAT rate', 'Minimum stock', 'Description'],
      [
        ['Dining chair', 'Black', '', 'CHAIR-BLK', '5012345678900', 'Chairs', 'Nordic', 49.5, 20, 'Standard VAT', 5, 'Solid beech'],
        ['Dining chair', 'White', '', 'CHAIR-WHT', '', 'Chairs', 'Nordic', 49.5, 20, 'Standard VAT', 5, ''],
        ['Desk lamp', '', '', '', '', 'Lighting', '', 19.99, '', '18', '', ''],
      ],
      [3, 4],
    );
    return new StreamableFile(file, { type: XLSX, disposition: 'attachment; filename="products-template.xlsx"' });
  }

  @Roles(...STOCK_ADJUST)
  @Get('stock/template')
  async stockTemplate() {
    const file = await templateXlsx(
      'Opening stock',
      'One row per item per place. Location = the code on its label (LOC-000012) or the full path. For multi-box kits, enter each box separately.',
      ['SKU or barcode *', 'Location *', 'Quantity *', 'Note'],
      [
        ['CHAIR-BLK', 'LOC-000012', 6, ''],
        ['5012345678900', 'Hamrun Shop › Top › Room 1 › Shelf A › A1', 2, 'Counted 1 Oct'],
      ],
      [0, 1],
    );
    return new StreamableFile(file, { type: XLSX, disposition: 'attachment; filename="opening-stock-template.xlsx"' });
  }

  @Roles(...CATALOG_WRITE)
  @Post('products')
  @HttpCode(200)
  @UseInterceptors(upload)
  importProducts(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined, @Query('commit') commit?: string) {
    if (!file) throw new BadRequestException('Choose an Excel or CSV file');
    return this.imports.importProducts(user, file.buffer, commit === 'true');
  }

  @Roles(...STOCK_ADJUST)
  @Post('stock')
  @HttpCode(200)
  @UseInterceptors(upload)
  importStock(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined, @Query('commit') commit?: string) {
    if (!file) throw new BadRequestException('Choose an Excel or CSV file');
    return this.imports.importOpeningStock(user, file.buffer, commit === 'true');
  }
}
