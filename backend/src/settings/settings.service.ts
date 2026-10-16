import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AppSettings {
  businessName: string;
  currency: string;
  /** True when entered prices already include VAT (normal for Malta retail). */
  pricesIncludeTax: boolean;
  labelWidthMm: number;
  labelHeightMm: number;
  /** Print the selling price on product labels. */
  labelShowPrice: boolean;
  /** Printed on invoices and receipts. */
  businessAddress: string;
  businessPhone: string;
  vatNumber: string;
  /** Thank-you / returns policy line at the bottom of receipts and invoices. */
  receiptFooter: string;
  /** Receipt printer paper width (58 or 80 mm usually). */
  receiptWidthMm: number;
  /** Cashiers may give up to this % discount per line; more needs an admin/manager. */
  maxDiscountPercent: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  businessName: 'Twayba',
  currency: 'EUR',
  pricesIncludeTax: true,
  labelWidthMm: 50,
  labelHeightMm: 25,
  labelShowPrice: false,
  businessAddress: '',
  businessPhone: '',
  vatNumber: '',
  receiptFooter: 'Thank you for your purchase!',
  receiptWidthMm: 80,
  maxDiscountPercent: 10,
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getAll(): Promise<AppSettings> {
    const rows = await this.prisma.setting.findMany();
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { ...DEFAULT_SETTINGS, ...pickKnown(stored) };
  }

  async update(userId: string, changes: Partial<AppSettings>) {
    const known = pickKnown(changes as Record<string, unknown>);
    await this.prisma.$transaction(
      Object.entries(known).map(([key, value]) =>
        this.prisma.setting.upsert({
          where: { key },
          create: { key, value: value as Prisma.InputJsonValue },
          update: { value: value as Prisma.InputJsonValue },
        }),
      ),
    );
    await this.audit.log({
      userId,
      action: 'SETTINGS_UPDATED',
      entity: 'Setting',
      data: known as Prisma.InputJsonValue,
    });
    return this.getAll();
  }
}

function pickKnown(values: Record<string, unknown>): Partial<AppSettings> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (values[key] !== undefined) out[key] = values[key];
  }
  return out as Partial<AppSettings>;
}
