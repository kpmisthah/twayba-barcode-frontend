import { rolesFor } from "./permissions";
import type { Role } from "./types";

export interface NavItem {
  href: string;
  label: string;
  roles: readonly Role[] | "all";
}

/** Menu entries. New phases add their pages here. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", roles: "all" },
  { href: "/products", label: "Products", roles: rolesFor("catalogRead") },
  { href: "/categories", label: "Categories", roles: rolesFor("catalogWrite") },
  { href: "/users", label: "Users", roles: rolesFor("users") },
  { href: "/settings", label: "Settings", roles: rolesFor("settings") },
  { href: "/account", label: "My account", roles: "all" },
];

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles === "all" || item.roles.includes(role));
}
