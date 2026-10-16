import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { HealthController } from './health.controller.js';
import { ImportsModule } from './imports/imports.module.js';
import { LabelsModule } from './labels/labels.module.js';
import { LocationsModule } from './locations/locations.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { ReturnsModule } from './returns/returns.module.js';
import { SalesModule } from './sales/sales.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { StockModule } from './stock/stock.module.js';
import { StocktakesModule } from './stocktakes/stocktakes.module.js';
import { TransfersModule } from './transfers/transfers.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    CatalogModule,
    LocationsModule,
    StockModule,
    SalesModule,
    ReturnsModule,
    StocktakesModule,
    TransfersModule,
    OrdersModule,
    ReportsModule,
    ImportsModule,
    LabelsModule,
    UploadsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
