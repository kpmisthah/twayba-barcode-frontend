import { Controller, Get, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AUDIT_READ } from '../auth/role-groups.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { dayRange } from '../reports/dates.js';

class AuditQuery {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  entity?: string;

  /** Matches the record id, or text inside the details (e.g. an order or invoice number). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

/** Read-only view of the audit trail. There is no endpoint to change or delete it. */
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles(...AUDIT_READ)
  @Get()
  async list(@Query() query: AuditQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const q = query.q?.trim();
    const where: Prisma.AuditLogWhereInput = {
      createdAt: dayRange(query.from, query.to),
      ...(query.userId && { userId: query.userId }),
      ...(query.action && { action: query.action }),
      ...(query.entity && { entity: query.entity }),
    };
    if (q) {
      // Search inside the JSON details with a text cast; keeps the filter in the database.
      const ids = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM audit_logs WHERE "entityId" = ${q} OR data::text ILIKE ${'%' + q + '%'} ORDER BY "createdAt" DESC LIMIT 5000`;
      where.id = { in: ids.map((r) => r.id) };
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, name: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** The distinct actions and record types, for the filter drop-downs. */
  @Roles(...AUDIT_READ)
  @Get('facets')
  async facets() {
    const [actions, entities] = await Promise.all([
      this.prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
      this.prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
    ]);
    return { actions: actions.map((a) => a.action), entities: entities.map((e) => e.entity) };
  }
}
