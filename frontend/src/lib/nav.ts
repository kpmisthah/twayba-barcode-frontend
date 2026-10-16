import { rolesFor } from "./permissions";
import type { Role } from "./types";

export interface NavItem {
  href: string;
  label: string;
  roles: readonly Role[] | "all";
  /** Heading the item is grouped under in the menu (none = top of the menu). */
  section?: "Sell" | "Deliveries" | "Stock" | "Admin" | "Account";
}

/** Menu entries, in menu order. New pages add themselves here. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", roles: "all" },
  { href: "/scan", label: "Scan", roles: rolesFor("stockRead") },

  { href: "/pos", label: "POS / Sell", roles: rolesFor("pos"), section: "Sell" },
  { href: "/sales", label: "Sales", roles: rolesFor("salesRead"), section: "Sell" },
  { href: "/returns", label: "Returns", roles: rolesFor("salesRead"), section: "Sell" },

  { href: "/deliveries", label: "Deliveries", roles: rolesFor("delivery"), section: "Deliveries" },
  { href: "/orders", label: "Orders", roles: rolesFor("orderRead"), section: "Deliveries" },

  { href: "/stock", label: "Update stock", roles: rolesFor("stockWrite"), section: "Stock" },
  { href: "/transfers", label: "Transfers", roles: rolesFor("stockRead"), section: "Stock" },
  { href: "/products", label: "Products", roles: rolesFor("catalogRead"), section: "Stock" },
  { href: "/categories", label: "Categories", roles: rolesFor("catalogWrite"), section: "Stock" },
  { href: "/locations", label: "Locations", roles: rolesFor("locationRead"), section: "Stock" },
  { href: "/stocktakes", label: "Stocktake", roles: rolesFor("stockRead"), section: "Stock" },
  { href: "/low-stock", label: "Low stock", roles: rolesFor("stockRead"), section: "Stock" },
  { href: "/stock-history", label: "Stock history", roles: rolesFor("stockRead"), section: "Stock" },

  { href: "/reports", label: "Reports", roles: rolesFor("reports"), section: "Admin" },
  { href: "/import", label: "Import from Excel", roles: rolesFor("catalogWrite"), section: "Admin" },
  { href: "/audit", label: "Audit log", roles: rolesFor("audit"), section: "Admin" },
  { href: "/users", label: "Users", roles: rolesFor("users"), section: "Admin" },
  { href: "/settings", label: "Settings", roles: rolesFor("settings"), section: "Admin" },
  { href: "/account", label: "My account", roles: "all", section: "Account" },
];

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles === "all" || item.roles.includes(role));
}
