import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';
import { SiteAccessService } from './site-access.service.js';

@Module({
  controllers: [LocationsController],
  providers: [LocationsService, SiteAccessService],
  exports: [LocationsService, SiteAccessService],
})
export class LocationsModule {}
