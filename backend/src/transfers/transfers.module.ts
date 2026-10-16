import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module.js';
import { StockModule } from '../stock/stock.module.js';
import { TransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';

@Module({
  imports: [StockModule, LocationsModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
