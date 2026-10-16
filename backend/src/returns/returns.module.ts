import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { StockModule } from '../stock/stock.module.js';
import { ReturnsController } from './returns.controller.js';
import { ReturnsService } from './returns.service.js';

@Module({
  imports: [SettingsModule, StockModule, LocationsModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
