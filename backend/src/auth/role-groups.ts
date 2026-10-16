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

/** Drivers included: they scan and move stock between locations too. */
export const LOCATION_READ = [...STAFF_READ, Role.DRIVER] as const;

/** Finding and scanning products — every role, since drivers handle stock too. */
export const PRODUCT_READ = LOCATION_READ;

export const LOCATION_WRITE = [Role.ADMIN, Role.MANAGER] as const;

export const STOCK_READ = LOCATION_READ;

/** Add, remove, transfer, mark damaged — the salesman and delivery staff do this too. */
export const STOCK_WRITE = [Role.ADMIN, Role.MANAGER, Role.WAREHOUSE, Role.CASHIER, Role.DRIVER] as const;

/** Stocktake-style corrections. */
export const STOCK_ADJUST = [Role.ADMIN, Role.MANAGER] as const;

/** Selling at the counter. */
export const POS = [Role.ADMIN, Role.MANAGER, Role.CASHIER] as const;

export const SALES_READ = [Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.VIEWER] as const;

/** Everyone can see orders (drivers and warehouse staff pick them). */
export const ORDER_READ = LOCATION_READ;

/** Create, edit, allocate, assign drivers and cancel orders. */
export const ORDER_WRITE = [Role.ADMIN, Role.MANAGER] as const;

/** Mark out for delivery / delivered / failed, report problems (drivers: own orders only). */
export const DELIVERY = [Role.ADMIN, Role.MANAGER, Role.DRIVER] as const;

/** Reports and the audit trail (Viewer = read-only access to stock, orders, reports, audit history). */
export const REPORTS_READ = [Role.ADMIN, Role.MANAGER, Role.VIEWER] as const;
export const AUDIT_READ = REPORTS_READ;

/** Dashboard figures. Drivers use their deliveries list instead (they only see their own orders). */
export const DASHBOARD = [Role.ADMIN, Role.MANAGER, Role.WAREHOUSE, Role.CASHIER, Role.VIEWER] as const;
