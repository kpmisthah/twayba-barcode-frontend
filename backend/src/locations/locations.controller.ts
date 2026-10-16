import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { LOCATION_READ, LOCATION_WRITE } from '../auth/role-groups.js';
import { CreateLocationsDto, UpdateLocationDto } from './dto/location.dto.js';
import { LocationsService } from './locations.service.js';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Roles(...LOCATION_READ)
  @Get()
  list(@Query('all') all?: string) {
    return this.locations.list(all === 'true');
  }

  /** GET /locations/lookup?code=LOC-000012 — for scanning a location label. */
  @Roles(...LOCATION_READ)
  @Get('lookup')
  lookup(@Query('code') code = '') {
    return this.locations.lookup(code);
  }

  @Roles(...LOCATION_READ)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.locations.get(id);
  }

  @Roles(...LOCATION_WRITE)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLocationsDto) {
    return this.locations.create(user.id, dto);
  }

  @Roles(...LOCATION_WRITE)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locations.update(user.id, id, dto);
  }
}
