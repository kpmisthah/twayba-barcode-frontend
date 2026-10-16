import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { LabelsController } from './labels.controller.js';
import { LabelsService } from './labels.service.js';

@Module({
  imports: [SettingsModule, LocationsModule],
  controllers: [LabelsController],
  providers: [LabelsService],
})
export class LabelsModule {}
