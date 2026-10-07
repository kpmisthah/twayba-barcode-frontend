import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword, verifyPassword } from '../common/password.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { publicUserSelect } from '../users/user.select.js';
import { JwtPayload } from './auth.types.js';

@Injectable()
export class AuthService {
  // Compared against when the login does not exist, so response time does not
  // reveal which emails/phones are registered.
  private readonly dummyHash = hashPassword(randomUUID());

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(login: string, password: string) {
    const identifier = login.trim();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier.toLowerCase() }, { phone: normalizePhone(identifier) }],
      },
    });

    const ok = await verifyPassword(password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !ok || !user.active) {
      if (user) {
        await this.audit.log({
          userId: user.id,
          action: user.active ? 'LOGIN_FAILED' : 'LOGIN_BLOCKED_INACTIVE',
          entity: 'User',
          entityId: user.id,
        });
      }
      throw new UnauthorizedException('Wrong login or password');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      select: publicUserSelect,
    });
    await this.audit.log({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id });

    const payload: JwtPayload = { sub: user.id, role: user.role };
    return { accessToken: await this.jwt.signAsync(payload), user: updated };
  }

  me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: publicUserSelect });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is wrong');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await this.audit.log({ userId, action: 'PASSWORD_CHANGED', entity: 'User', entityId: userId });
  }
}

/** Keep digits and a leading +, so "+356 7912 3456" and "+35679123456" match. */
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}
