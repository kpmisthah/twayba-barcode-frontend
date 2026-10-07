import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CreateTaxRateDto, UpdateTaxRateDto } from './dto/tax-rate.dto.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { SettingsService } from './settings.service.js';
import { TaxRatesService } from './tax-rates.service.js';

@Controller()
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly taxRates: TaxRatesService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.settings.getAll();
  }

  @Roles(Role.ADMIN)
  @Patch('settings')
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.settings.update(user.id, dto);
  }

  @Get('tax-rates')
  listTaxRates(@Query('all') all?: string) {
    return this.taxRates.list(all === 'true');
  }

  @Roles(Role.ADMIN)
  @Post('tax-rates')
  createTaxRate(@CurrentUser() user: AuthUser, @Body() dto: CreateTaxRateDto) {
    return this.taxRates.create(user.id, dto);
  }

  @Roles(Role.ADMIN)
  @Patch('tax-rates/:id')
  updateTaxRate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxRateDto,
  ) {
    return this.taxRates.update(user.id, id, dto);
  }
}
