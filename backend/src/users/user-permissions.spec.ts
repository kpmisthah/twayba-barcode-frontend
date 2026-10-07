import { Role } from '@prisma/client';
import { normalizePhone } from '../auth/auth.service.js';
import { canManageRole, manageableRoles } from './user-permissions.js';

describe('canManageRole', () => {
  it('lets an admin manage every role', () => {
    for (const role of Object.values(Role)) {
      expect(canManageRole(Role.ADMIN, role)).toBe(true);
    }
  });

  it('lets a manager manage staff roles but not admins or managers', () => {
    expect(canManageRole(Role.MANAGER, Role.CASHIER)).toBe(true);
    expect(canManageRole(Role.MANAGER, Role.DRIVER)).toBe(true);
    expect(canManageRole(Role.MANAGER, Role.WAREHOUSE)).toBe(true);
    expect(canManageRole(Role.MANAGER, Role.VIEWER)).toBe(true);
    expect(canManageRole(Role.MANAGER, Role.ADMIN)).toBe(false);
    expect(canManageRole(Role.MANAGER, Role.MANAGER)).toBe(false);
  });

  it('does not let other roles manage anyone', () => {
    for (const actor of [Role.WAREHOUSE, Role.CASHIER, Role.DRIVER, Role.VIEWER]) {
      expect(manageableRoles(actor)).toEqual([]);
    }
  });
});

describe('normalizePhone', () => {
  it('strips spaces and dashes but keeps a leading +', () => {
    expect(normalizePhone('+356 7912-3456')).toBe('+35679123456');
    expect(normalizePhone(' 7912 3456 ')).toBe('79123456');
  });
});
