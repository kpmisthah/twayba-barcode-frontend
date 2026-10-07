import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';
import { TaxRatesService } from './tax-rates.service.js';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, TaxRatesService],
  exports: [SettingsService],
})
export class SettingsModule {}
