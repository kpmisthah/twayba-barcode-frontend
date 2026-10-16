import { timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImportIssueStatus } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ORDER_WRITE } from '../auth/role-groups.js';
import { ImportIssuesService } from './import-issues.service.js';

/**
 * The website sends new orders here. Not a user login: the website proves itself with the
 * shared secret in the X-Webhook-Secret header (WEBHOOK_SECRET in .env). See docs/website-webhook.md.
 * The body is validated by ImportIssuesService (not the global pipe) so failures can be kept.
 */
@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly issues: ImportIssuesService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('orders')
  @HttpCode(200)
  async receive(@Headers('x-webhook-secret') secret: string | undefined, @Body() body: Record<string, unknown>) {
    const expected = this.config.get<string>('WEBHOOK_SECRET');
    if (!expected) throw new ServiceUnavailableException('Website orders are not enabled (WEBHOOK_SECRET is not set)');
    if (!secret || !sameSecret(secret, expected)) throw new UnauthorizedException('Wrong webhook secret');

    const { duplicate, order } = await this.issues.receive(body);
    return { duplicate, orderId: order.id, orderNumber: order.orderNumber, status: order.status };
  }
}

/** Website orders that could not be imported — for managers to fix and retry. */
@Controller('website-orders')
export class ImportIssuesController {
  constructor(private readonly issues: ImportIssuesService) {}

  @Roles(...ORDER_WRITE)
  @Get('issues')
  list(@Query('status') status?: string) {
    const s = Object.values(ImportIssueStatus).find((v) => v === status);
    return this.issues.list(s);
  }

  @Roles(...ORDER_WRITE)
  @Post('issues/:id/retry')
  @HttpCode(200)
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.issues.retry(user, id);
  }

  @Roles(...ORDER_WRITE)
  @Post('issues/:id/ignore')
  @HttpCode(200)
  ignore(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.issues.ignore(user, id);
  }
}

/** Constant-time comparison, so the secret can't be guessed from response timings. */
function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
