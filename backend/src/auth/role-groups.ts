import { Role } from '@prisma/client';

/** Everyone except drivers, who only see their own deliveries. */
export const STAFF_READ = [
  Role.ADMIN,
  Role.MANAGER,
  Role.WAREHOUSE,
  Role.CASHIER,
  Role.VIEWER,
] as const;

export const CATALOG_WRITE = [Role.ADMIN, Role.MANAGER] as const;

export const LABEL_PRINT = [Role.ADMIN, Role.MANAGER, Role.WAREHOUSE] as const;
