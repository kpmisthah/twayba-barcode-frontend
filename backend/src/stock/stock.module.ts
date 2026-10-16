import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module.js';
import { StockQueryService } from './stock-query.service.js';
import { StockController } from './stock.controller.js';
import { StockService } from './stock.service.js';

@Module({
  imports: [LocationsModule],
  controllers: [StockController],
  providers: [StockService, StockQueryService],
  exports: [StockService, StockQueryService],
})
export class StockModule {}
