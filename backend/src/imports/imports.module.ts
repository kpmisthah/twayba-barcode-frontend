import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { StockModule } from '../stock/stock.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

@Module({
  imports: [CatalogModule, StockModule, LocationsModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
