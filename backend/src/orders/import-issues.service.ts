import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { ImportIssueStatus, OrderSource, Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WebhookOrderDto } from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

/**
 * Website orders that fail are never silently dropped (client brief §13 "Integration failure"):
 * each is stored with the error, counted on retries, shown to managers, and can be retried after
 * the cause (e.g. a missing SKU) is fixed. A later successful delivery of the same order closes it.
 */
@Injectable()
export class ImportIssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
  ) {}

  /** Validates and imports a raw webhook body, recording any failure. */
  async receive(body: unknown) {
    const externalId = typeof (body as { externalId?: unknown })?.externalId === 'string' ? (body as { externalId: string }).externalId.trim() || null : null;
    try {
      const dto = await this.validate(body);
      const result = await this.orders.importFromWebsite(dto);
      await this.resolve(externalId, result.order.id, null);
      return result;
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() < 500) await this.record(externalId, body, describe(e));
      throw e;
    }
  }

  async list(status?: ImportIssueStatus) {
    return this.prisma.importIssue.findMany({ where: status ? { status } : {}, orderBy: { lastTriedAt: 'desc' }, take: 200 });
  }

  openCount() {
    return this.prisma.importIssue.count({ where: { status: ImportIssueStatus.OPEN } });
  }

  /** Try the stored order again (after fixing the SKU mapping, adding the product…). */
  async retry(user: AuthUser, id: string) {
    const issue = await this.prisma.importIssue.findUnique({ where: { id } });
    if (!issue) throw new NotFoundException('Problem not found');
    if (issue.status === ImportIssueStatus.RESOLVED) throw new BadRequestException('Already imported');
    try {
      const dto = await this.validate(issue.payload);
      const result = await this.orders.importFromWebsite(dto);
      await this.prisma.importIssue.update({
        where: { id },
        data: { status: ImportIssueStatus.RESOLVED, orderId: result.order.id, resolvedById: user.id, resolvedAt: new Date(), attempts: { increment: 1 }, lastTriedAt: new Date() },
      });
      await this.audit.log({ userId: user.id, action: 'WEBSITE_ORDER_RETRIED', entity: 'ImportIssue', entityId: id, data: { externalId: issue.externalId, orderNumber: result.order.orderNumber } });
      return { ok: true, orderId: result.order.id, orderNumber: result.order.orderNumber };
    } catch (e) {
      if (!(e instanceof HttpException) || e.getStatus() >= 500) throw e;
      await this.prisma.importIssue.update({ where: { id }, data: { error: describe(e), attempts: { increment: 1 }, lastTriedAt: new Date() } });
      return { ok: false, error: describe(e) };
    }
  }

  async ignore(user: AuthUser, id: string) {
    const issue = await this.prisma.importIssue.findUnique({ where: { id } });
    if (!issue) throw new NotFoundException('Problem not found');
    await this.prisma.importIssue.update({ where: { id }, data: { status: ImportIssueStatus.IGNORED, resolvedById: user.id, resolvedAt: new Date() } });
    await this.audit.log({ userId: user.id, action: 'WEBSITE_ORDER_IGNORED', entity: 'ImportIssue', entityId: id, data: { externalId: issue.externalId, error: issue.error } });
    return { ok: true };
  }

  // ---------------------------------------------------------------- helpers

  private async validate(body: unknown): Promise<WebhookOrderDto> {
    const dto = plainToInstance(WebhookOrderDto, body ?? {});
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) {
      const messages = errors.flatMap((err) => flatten(err));
      throw new BadRequestException(messages);
    }
    return dto;
  }

  private async record(externalId: string | null, payload: unknown, error: string) {
    const data = { payload: (payload ?? {}) as Prisma.InputJsonValue, error, lastTriedAt: new Date() };
    if (externalId) {
      await this.prisma.importIssue.upsert({
        where: { source_externalId: { source: OrderSource.WEBSITE, externalId } },
        create: { source: OrderSource.WEBSITE, externalId, ...data },
        update: { ...data, status: ImportIssueStatus.OPEN, attempts: { increment: 1 } },
      });
    } else {
      await this.prisma.importIssue.create({ data: { source: OrderSource.WEBSITE, externalId: null, ...data } });
    }
  }

  private async resolve(externalId: string | null, orderId: string, userId: string | null) {
    if (!externalId) return;
    await this.prisma.importIssue.updateMany({
      where: { source: OrderSource.WEBSITE, externalId, status: ImportIssueStatus.OPEN },
      data: { status: ImportIssueStatus.RESOLVED, orderId, resolvedById: userId, resolvedAt: new Date() },
    });
  }
}

function describe(e: HttpException): string {
  const r = e.getResponse();
  if (typeof r === 'string') return r;
  const m = (r as { message?: unknown }).message;
  return Array.isArray(m) ? m.join('; ') : typeof m === 'string' ? m : e.message;
}

/** class-validator errors, including nested ones (items[0].sku…), as readable lines. */
function flatten(err: import('class-validator').ValidationError, prefix = ''): string[] {
  const path = prefix ? `${prefix}.${err.property}` : err.property;
  const own = Object.values(err.constraints ?? {}).map((m) => (prefix ? `${path}: ${m}` : m));
  return [...own, ...(err.children ?? []).flatMap((c) => flatten(c, path))];
}
