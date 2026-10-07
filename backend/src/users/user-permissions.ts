import { Role } from '@prisma/client';

/** Roles a Manager may create and edit. Admins can manage every role. */
const MANAGER_MANAGEABLE: readonly Role[] = [
  Role.WAREHOUSE,
  Role.CASHIER,
  Role.DRIVER,
  Role.VIEWER,
];

export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === Role.ADMIN) return true;
  if (actorRole === Role.MANAGER) return MANAGER_MANAGEABLE.includes(targetRole);
  return false;
}

export function manageableRoles(actorRole: Role): Role[] {
  return Object.values(Role).filter((r) => canManageRole(actorRole, r));
}
