export const ROLES = ["ADMIN", "MANAGER", "WAREHOUSE", "CASHIER", "DRIVER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  WAREHOUSE: "Warehouse staff",
  CASHIER: "Cashier",
  DRIVER: "Driver",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: "Full access, including users and settings",
  MANAGER: "Products, inventory, orders, reports and staff",
  WAREHOUSE: "Scanning, stock, transfers and picking",
  CASHIER: "POS, sales, invoices and returns",
  DRIVER: "Own assigned deliveries only",
  VIEWER: "Read-only access to stock, orders and reports",
};

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}
