import { Controller, Get, NotFoundException, Param, Query, StreamableFile } from '@nestjs/common';
import { LocationType } from '@prisma/client';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { REPORTS_READ } from '../auth/role-groups.js';
import { LocationsService } from '../locations/locations.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { REPORTS, ReportFilters } from './catalog.js';
import { reportToXlsx } from './excel.js';
import { ReportsService } from './reports.service.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

class ReportQuery implements ReportFilters {
  @IsOptional()
  @Matches(DAY, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DAY, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
    private readonly settings: SettingsService,
  ) {}

  @Roles(...REPORTS_READ)
  @Get()
  catalog() {
    return REPORTS;
  }

  /** Choices for the filter bar. */
  @Roles(...REPORTS_READ)
  @Get('options')
  async options() {
    const [users, categories, all] = await Promise.all([
      this.prisma.user.findMany({ select: { id: true, name: true, role: true, active: true }, orderBy: { name: 'asc' } }),
      this.prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.locations.list(false),
    ]);
    return {
      users,
      categories,
      locations: all.filter((l) => l.type !== LocationType.TRANSIT && l.type !== LocationType.DAMAGED).map((l) => ({ id: l.id, path: l.path })),
    };
  }

  @Roles(...REPORTS_READ)
  @Get(':type')
  run(@CurrentUser() user: AuthUser, @Param('type') type: string, @Query() query: ReportQuery) {
    return this.reports.run(type, query, user);
  }

  @Roles(...REPORTS_READ)
  @Get(':type/xlsx')
  async xlsx(@CurrentUser() user: AuthUser, @Param('type') type: string, @Query() query: ReportQuery) {
    if (!REPORTS.some((r) => r.type === type)) throw new NotFoundException('Unknown report');
    const [report, settings, subtitle] = await Promise.all([this.reports.run(type, query, user), this.settings.getAll(), this.describe(query)]);
    const file = await reportToXlsx(report, subtitle, settings.businessName);
    const stamp = new Date().toISOString().slice(0, 10);
    return new StreamableFile(file, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${type}-${stamp}.xlsx"`,
    });
  }

  /** "1 Oct 2026 – 31 Oct 2026 · Hamrun Shop · Cashier: Maria" for the top of the sheet. */
  private async describe(q: ReportQuery) {
    const bits: string[] = [];
    const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    if (q.from || q.to) bits.push(`${q.from ? fmt(q.from) : 'start'} – ${q.to ? fmt(q.to) : 'today'}`);
    if (q.locationId) bits.push((await this.locations.withPaths()).find((l) => l.id === q.locationId)?.path ?? '');
    if (q.productId) bits.push((await this.prisma.product.findUnique({ where: { id: q.productId }, select: { name: true } }))?.name ?? '');
    if (q.categoryId) bits.push((await this.prisma.category.findUnique({ where: { id: q.categoryId }, select: { name: true } }))?.name ?? '');
    if (q.userId) bits.push((await this.prisma.user.findUnique({ where: { id: q.userId }, select: { name: true } }))?.name ?? '');
    bits.push(`generated ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/Malta' })}`);
    return bits.filter(Boolean).join(' · ');
  }
}
