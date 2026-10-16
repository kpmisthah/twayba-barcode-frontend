import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module.js';
import { StockModule } from '../stock/stock.module.js';
import { StocktakesController } from './stocktakes.controller.js';
import { StocktakesService } from './stocktakes.service.js';

@Module({
  imports: [StockModule, LocationsModule],
  controllers: [StocktakesController],
  providers: [StocktakesService],
})
export class StocktakesModule {}
