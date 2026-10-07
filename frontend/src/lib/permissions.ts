import type { Role } from "./types";

/** Mirrors the API's role groups so the UI only offers actions that will succeed. */
const GROUPS = {
  catalogRead: ["ADMIN", "MANAGER", "WAREHOUSE", "CASHIER", "VIEWER"],
  catalogWrite: ["ADMIN", "MANAGER"],
  labelPrint: ["ADMIN", "MANAGER", "WAREHOUSE"],
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
