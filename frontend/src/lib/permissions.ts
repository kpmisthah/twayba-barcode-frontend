import type { Role } from "./types";

/** Mirrors the API's role groups so the UI only offers actions that will succeed. */
const GROUPS = {
  catalogRead: ["ADMIN", "MANAGER", "WAREHOUSE", "CASHIER", "VIEWER", "DRIVER"],
  catalogWrite: ["ADMIN", "MANAGER"],
  labelPrint: ["ADMIN", "MANAGER", "WAREHOUSE"],
  locationRead: ["ADMIN", "MANAGER", "WAREHOUSE", "CASHIER", "VIEWER", "DRIVER"],
  locationWrite: ["ADMIN", "MANAGER"],
  stockRead: ["ADMIN", "MANAGER", "WAREHOUSE", "CASHIER", "VIEWER", "DRIVER"],
  stockWrite: ["ADMIN", "MANAGER", "WAREHOUSE", "CASHIER", "DRIVER"],
  stockAdjust: ["ADMIN", "MANAGER"],
  pos: ["ADMIN", "MANAGER", "CASHIER"],
  salesRead: ["ADMIN", "MANAGER", "CASHIER", "VIEWER"],
  orderRead: ["ADMIN", "MANAGER", "WAREHOUSE", "CASHIER", "VIEWER", "DRIVER"],
  orderWrite: ["ADMIN", "MANAGER"],
  delivery: ["ADMIN", "MANAGER", "DRIVER"],
  reports: ["ADMIN", "MANAGER", "VIEWER"],
  audit: ["ADMIN", "MANAGER", "VIEWER"],
  dashboard: ["ADMIN", "MANAGER", "WAREHOUSE", "CASHIER", "VIEWER"],
  settings: ["ADMIN"],
  users: ["ADMIN", "MANAGER"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof GROUPS;

export function can(role: Role | undefined, permission: Permission): boolean {
  return !!role && (GROUPS[permission] as readonly Role[]).includes(role);
}

export function rolesFor(permission: Permission): readonly Role[] {
  return GROUPS[permission];
}
