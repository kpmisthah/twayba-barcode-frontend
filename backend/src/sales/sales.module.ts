import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { StockModule } from '../stock/stock.module.js';
import { DocumentsService } from './documents.service.js';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

@Module({
  imports: [SettingsModule, StockModule, LocationsModule],
  controllers: [SalesController],
  providers: [SalesService, DocumentsService],
  exports: [SalesService],
})
export class SalesModule {}
