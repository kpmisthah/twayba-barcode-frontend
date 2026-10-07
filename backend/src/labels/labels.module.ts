import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { LabelsController } from './labels.controller.js';
import { LabelsService } from './labels.service.js';

@Module({
  imports: [SettingsModule],
  controllers: [LabelsController],
  providers: [LabelsService],
})
export class LabelsModule {}
