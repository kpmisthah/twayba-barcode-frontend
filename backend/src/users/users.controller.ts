import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ListUsersQuery } from './dto/list-users.query.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { SetActiveDto } from './dto/set-active.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
@Roles(Role.ADMIN, Role.MANAGER)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: ListUsersQuery) {
    return this.users.list(query);
  }

  /** Roles the current user is allowed to assign — used to build the role dropdown. */
  @Get('assignable-roles')
  assignableRoles(@CurrentUser() actor: AuthUser) {
    return this.users.assignableRoles(actor);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(actor, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(actor, id, dto);
  }

  @Patch(':id/active')
  setActive(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetActiveDto,
  ) {
    return this.users.setActive(actor, id, dto.active);
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  async resetPassword(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    await this.users.resetPassword(actor, id, dto.newPassword);
  }
}
