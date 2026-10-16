import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module.js';
import { StockModule } from '../stock/stock.module.js';
import { DeliveriesService } from './deliveries.service.js';
import { ImportIssuesService } from './import-issues.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { ImportIssuesController, WebhookController } from './webhook.controller.js';

@Module({
  imports: [StockModule, LocationsModule],
  controllers: [OrdersController, WebhookController, ImportIssuesController],
  providers: [OrdersService, DeliveriesService, ImportIssuesService],
  exports: [OrdersService, ImportIssuesService],
})
export class OrdersModule {}
