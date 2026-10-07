import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { normalizePhone } from '../auth/auth.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { hashPassword } from '../common/password.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ListUsersQuery } from './dto/list-users.query.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { canManageRole, manageableRoles } from './user-permissions.js';
import { publicUserSelect } from './user.select.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListUsersQuery) {
    const q = query.q?.trim();
    return this.prisma.user.findMany({
      where: {
        role: query.role,
        active: query.active,
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
        }),
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: publicUserSelect,
    });
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: publicUserSelect });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  assignableRoles(actor: AuthUser) {
    return manageableRoles(actor.role);
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    this.assertCanManageRole(actor, dto.role);
    const email = dto.email ? dto.email.trim().toLowerCase() : null;
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (!email && !phone) throw new BadRequestException('Enter an email or a phone number');

    const passwordHash = await hashPassword(dto.password);
    const user = await this.uniqueGuard(() =>
      this.prisma.user.create({
        data: { name: dto.name.trim(), email, phone, role: dto.role, passwordHash },
        select: publicUserSelect,
      }),
    );
    await this.audit.log({
      userId: actor.id,
      action: 'USER_CREATED',
      entity: 'User',
      entityId: user.id,
      data: { name: user.name, email, phone, role: user.role },
    });
    return user;
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const target = await this.findTarget(actor, id);

    if (dto.role && dto.role !== target.role) {
      if (target.id === actor.id) throw new ForbiddenException('You cannot change your own role');
      this.assertCanManageRole(actor, dto.role);
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.email !== undefined) data.email = dto.email ? dto.email.trim().toLowerCase() : null;
    if (dto.phone !== undefined) data.phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (dto.role !== undefined) data.role = dto.role;

    const nextEmail = data.email !== undefined ? data.email : target.email;
    const nextPhone = data.phone !== undefined ? data.phone : target.phone;
    if (!nextEmail && !nextPhone) throw new BadRequestException('A user needs an email or a phone number');

    const user = await this.prisma.$transaction(async (tx) => {
      if (target.role === Role.ADMIN && dto.role && dto.role !== Role.ADMIN) {
        await this.assertAnotherActiveAdmin(tx, target.id);
      }
      return this.uniqueGuard(() =>
        tx.user.update({ where: { id }, data, select: publicUserSelect }),
      );
    });

    await this.audit.log({
      userId: actor.id,
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: id,
      data: {
        before: { name: target.name, email: target.email, phone: target.phone, role: target.role },
        after: { name: user.name, email: user.email, phone: user.phone, role: user.role },
      },
    });
    return user;
  }

  async setActive(actor: AuthUser, id: string, active: boolean) {
    const target = await this.findTarget(actor, id);
    if (target.id === actor.id && !active) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      if (!active && target.role === Role.ADMIN) {
        await this.assertAnotherActiveAdmin(tx, target.id);
      }
      return tx.user.update({ where: { id }, data: { active }, select: publicUserSelect });
    });

    await this.audit.log({
      userId: actor.id,
      action: active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entity: 'User',
      entityId: id,
    });
    return user;
  }

  async resetPassword(actor: AuthUser, id: string, newPassword: string) {
    await this.findTarget(actor, id);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await this.audit.log({
      userId: actor.id,
      action: 'PASSWORD_RESET',
      entity: 'User',
      entityId: id,
    });
  }

  private async findTarget(actor: AuthUser, id: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    if (target.id !== actor.id) this.assertCanManageRole(actor, target.role);
    return target;
  }

  private assertCanManageRole(actor: AuthUser, role: Role) {
    if (!canManageRole(actor.role, role)) {
      throw new ForbiddenException(`You cannot manage users with the ${role} role`);
    }
  }

  private async assertAnotherActiveAdmin(tx: Prisma.TransactionClient, excludeId: string) {
    const others = await tx.user.count({
      where: { role: Role.ADMIN, active: true, id: { not: excludeId } },
    });
    if (others === 0) {
      throw new BadRequestException('There must always be at least one active admin');
    }
  }

  private async uniqueGuard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const field = (e.meta?.target as string[] | undefined)?.join(', ') ?? 'value';
        throw new ConflictException(`This ${field} is already used by another user`);
      }
      throw e;
    }
  }
}
