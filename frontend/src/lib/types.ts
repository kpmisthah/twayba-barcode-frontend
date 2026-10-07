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

// ---------------------------------------------------------------- catalogue

/** Money values arrive from the API as strings (exact decimals). */
export type Money = string;

export type ProductType = "STANDARD" | "KIT";
export type ProductStatus = "ACTIVE" | "INACTIVE";
export type VariantKind = "STANDARD" | "KIT" | "COMPONENT";
export type BarcodeType = "INTERNAL" | "SUPPLIER";

export interface Settings {
  businessName: string;
  currency: string;
  pricesIncludeTax: boolean;
  labelWidthMm: number;
  labelHeightMm: number;
  labelShowPrice: boolean;
}

export interface TaxRate {
  id: string;
  name: string;
  rate: Money;
  isDefault: boolean;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  active: boolean;
  _count?: { products: number };
}

export interface Barcode {
  id: string;
  code: string;
  type: BarcodeType;
  active: boolean;
  createdAt: string;
  deactivatedAt: string | null;
}

export interface Variant {
  id: string;
  kind: VariantKind;
  code: string;
  sku: string;
  name: string;
  color: string | null;
  size: string | null;
  price: Money | null;
  /** Only sent to admins and managers. */
  costPrice?: Money | null;
  active: boolean;
  sortOrder: number;
  barcodes: Barcode[];
  components: {
    id: string;
    quantity: number;
    componentVariant: { id: string; code: string; sku: string; name: string; active: boolean };
  }[];
}

export interface Product {
  id: string;
  number: number;
  name: string;
  description: string | null;
  type: ProductType;
  status: ProductStatus;
  brand: string | null;
  minStock: number;
  images: string[];
  category: { id: string; name: string } | null;
  taxRate: { id: string; name: string; rate: Money } | null;
  variants: Variant[];
}

export interface ProductListItem {
  id: string;
  name: string;
  type: ProductType;
  status: ProductStatus;
  brand: string | null;
  images: string[];
  category: { id: string; name: string } | null;
  variants: Pick<Variant, "id" | "kind" | "code" | "sku" | "name" | "price" | "active">[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
