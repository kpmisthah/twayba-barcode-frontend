import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, StreamableFile } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { POS, SALES_READ } from '../auth/role-groups.js';
import { SettingsService } from '../settings/settings.service.js';
import { renderCreditNote } from './credit-note-pdf.js';
import { CreateReturnDto, ListReturnsQuery } from './dto/return.dto.js';
import { ReturnsService } from './returns.service.js';

@Controller('returns')
export class ReturnsController {
  constructor(
    private readonly returns: ReturnsService,
    private readonly settings: SettingsService,
  ) {}

  @Roles(...POS)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReturnDto) {
    return this.returns.create(user, dto);
  }

  @Roles(...SALES_READ)
  @Get()
  list(@Query() query: ListReturnsQuery) {
    return this.returns.list(query);
  }

  @Roles(...SALES_READ)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.returns.get(id);
  }

  @Roles(...SALES_READ)
  @Get(':id/pdf')
  async pdf(@Param('id', ParseUUIDPipe) id: string) {
    const [note, settings] = await Promise.all([this.returns.get(id), this.settings.getAll()]);
    return new StreamableFile(await renderCreditNote(note, settings), {
      type: 'application/pdf',
      disposition: `inline; filename="${note.creditNumber}.pdf"`,
    });
  }
}
