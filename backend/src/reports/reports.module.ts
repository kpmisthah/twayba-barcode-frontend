import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { StockModule } from '../stock/stock.module.js';
import { DashboardController } from './dashboard.controller.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [LocationsModule, StockModule, SettingsModule],
  controllers: [ReportsController, DashboardController],
  providers: [ReportsService],
})
export class ReportsModule {}
