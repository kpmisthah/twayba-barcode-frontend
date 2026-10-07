import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTaxRateDto, UpdateTaxRateDto } from './dto/tax-rate.dto.js';

@Injectable()
export class TaxRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(includeInactive: boolean) {
    return this.prisma.taxRate.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ isDefault: 'desc' }, { rate: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateTaxRateDto) {
    const rate = await this.save(() =>
      this.prisma.$transaction(async (tx) => {
        const isFirst = (await tx.taxRate.count()) === 0;
        const isDefault = dto.isDefault ?? isFirst;
        if (isDefault) await tx.taxRate.updateMany({ data: { isDefault: false } });
        return tx.taxRate.create({
          data: { name: dto.name.trim(), rate: dto.rate, isDefault, active: dto.active ?? true },
        });
      }),
    );
    await this.audit.log({
      userId,
      action: 'TAX_RATE_CREATED',
      entity: 'TaxRate',
      entityId: rate.id,
      data: { name: rate.name, rate: rate.rate.toString() },
    });
    return rate;
  }

  async update(userId: string, id: string, dto: UpdateTaxRateDto) {
    const before = await this.prisma.taxRate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Tax rate not found');

    const rate = await this.save(() =>
      this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) await tx.taxRate.updateMany({ data: { isDefault: false } });
        const data: Prisma.TaxRateUpdateInput = {
          name: dto.name?.trim(),
          rate: dto.rate,
          isDefault: dto.isDefault,
          active: dto.active,
        };
        // An inactive rate can't stay the default.
        if (dto.active === false) data.isDefault = false;
        return tx.taxRate.update({ where: { id }, data });
      }),
    );
    await this.audit.log({
      userId,
      action: 'TAX_RATE_UPDATED',
      entity: 'TaxRate',
      entityId: id,
      data: {
        before: { name: before.name, rate: before.rate.toString(), active: before.active },
        after: { name: rate.name, rate: rate.rate.toString(), active: rate.active },
      },
    });
    return rate;
  }

  private async save<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (isUniqueViolation(e, 'name')) throw new ConflictException('A tax rate with this name already exists');
      throw e;
    }
  }
}
