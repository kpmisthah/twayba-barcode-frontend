import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { verifyPassword } from '../common/password.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizePhone } from './auth.service.js';

/** Roles that can approve overrides (big discounts, wrong pick location, missing boxes). */
export const APPROVER_ROLES: Role[] = [Role.ADMIN, Role.MANAGER];

export interface ApprovalInput {
  login: string;
  password: string;
}

/**
 * An admin/manager types their own login on someone else's device to approve an override.
 * Returns the approver's id, or throws 403.
 */
export async function verifyApprover(prisma: PrismaService, approval: ApprovalInput): Promise<string> {
  const login = approval.login.trim();
  const approver = await prisma.user.findFirst({
    where: { OR: [{ email: login.toLowerCase() }, { phone: normalizePhone(login) }] },
  });
  const ok = !!approver && approver.active && (await verifyPassword(approval.password, approver.passwordHash));
  if (!approver || !ok || !APPROVER_ROLES.includes(approver.role)) {
    throw new ForbiddenException('Approval failed — an active admin or manager must enter their own login');
  }
  return approver.id;
}
