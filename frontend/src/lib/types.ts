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
  CASHIER: "POS, sales, invoices and returns; add, remove and move stock",
  DRIVER: "Own deliveries; add, remove and move stock",
  VIEWER: "Read-only access to stock, orders and reports",
};

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  /** Sites this user may change stock in; empty = all. Ignored for admins/managers. */
  siteIds: string[];
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
  businessAddress: string;
  businessPhone: string;
  vatNumber: string;
  receiptFooter: string;
  receiptWidthMm: number;
  maxDiscountPercent: number;
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

// ---------------------------------------------------------------- locations

export type LocationType = "SITE" | "FLOOR" | "ROOM" | "SHELF" | "SPACE" | "TRANSIT" | "DAMAGED";

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  SITE: "Site",
  FLOOR: "Floor",
  ROOM: "Room",
  SHELF: "Shelf",
  SPACE: "Space",
  TRANSIT: "System",
  DAMAGED: "System",
};

/** Mirrors the API: what may be added under each type ("ROOT" = top level). */
export const LOCATION_CHILD_TYPES: Record<LocationType | "ROOT", LocationType[]> = {
  ROOT: ["SITE"],
  SITE: ["FLOOR", "ROOM"],
  FLOOR: ["ROOM"],
  ROOM: ["SHELF"],
  SHELF: ["SPACE"],
  SPACE: [],
  TRANSIT: [],
  DAMAGED: [],
};

export interface Location {
  id: string;
  type: LocationType;
  name: string;
  /** Scan code on the location label, e.g. LOC-000012. */
  code: string;
  parentId: string | null;
  /** The site (top-level location) it belongs to. */
  siteId: string;
  sortOrder: number;
  active: boolean;
  /** "Hamrun Shop › Top › Room 1 › Shelf A › A1" */
  path: string;
  pathNames: string[];
}

// ---------------------------------------------------------------- stock

export type MovementType =
  | "STOCK_IN"
  | "STOCK_OUT"
  | "TRANSFER"
  | "ADJUSTMENT"
  | "RESERVE"
  | "RELEASE"
  | "LOAD"
  | "DELIVER"
  | "RETURN"
  | "SALE"
  | "SALE_RETURN"
  | "DAMAGE"
  | "TRANSFER_OUT"
  | "TRANSFER_IN";

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  STOCK_IN: "Stock in",
  STOCK_OUT: "Stock out",
  TRANSFER: "Transfer",
  ADJUSTMENT: "Correction",
  RESERVE: "Reserved",
  RELEASE: "Released",
  LOAD: "Loaded",
  DELIVER: "Delivered",
  RETURN: "Returned",
  SALE: "Sale",
  SALE_RETURN: "Sale return",
  DAMAGE: "Damaged",
  TRANSFER_OUT: "Sent (transfer)",
  TRANSFER_IN: "Received (transfer)",
};

export interface StockTotals {
  /** In real locations (not In Transit / Damaged). */
  onHand: number;
  reserved: number;
  available: number;
  inTransit: number;
  damaged: number;
}

export interface StockAtLocation {
  locationId: string;
  path: string;
  site: string;
  type: LocationType;
  onHand: number;
  reserved: number;
  available: number;
}

export interface StockItem {
  variantId: string;
  kind: VariantKind;
  code: string;
  name: string;
  active: boolean;
  totals: StockTotals;
  /** Below the product's minimum stock. */
  low: boolean;
  locations: StockAtLocation[];
}

export interface ProductStock {
  productId: string;
  minStock: number;
  items: StockItem[];
  kit: {
    sellable: number;
    low: boolean;
    boxes: { variantId: string; perKit: number; available: number; spare: number }[];
  } | null;
}

export interface LocationStock {
  location: Location;
  items: {
    locationId: string;
    path: string;
    variant: { id: string; kind: VariantKind; code: string; name: string; product: { id: string; name: string; images: string[] } };
    onHand: number;
    reserved: number;
    available: number;
  }[];
}

export interface Movement {
  id: string;
  type: MovementType;
  quantity: number;
  reason: string | null;
  note: string | null;
  reference: string | null;
  createdAt: string;
  variant: { id: string; code: string; name: string; product: { id: string; name: string } };
  user: { id: string; name: string } | null;
  from: { id: string; path: string } | null;
  to: { id: string; path: string } | null;
}

// ---------------------------------------------------------------- sales

export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  OTHER: "Other",
};

export interface MoneyTotals {
  gross: Money;
  discount: Money;
  net: Money;
  tax: Money;
  total: Money;
}

export interface SalePreview {
  lines: (MoneyTotals & { variantId: string; unitPrice: Money; taxRate: number })[];
  totals: MoneyTotals;
  maxDiscountPercent: number;
  needsApproval: boolean;
}

export interface Sale {
  id: string;
  number: number;
  invoiceNumber: string;
  site: { id: string; name: string } | null;
  cashier: { id: string; name: string };
  approvedBy: { id: string; name: string } | null;
  customerName: string | null;
  customerPhone: string | null;
  note: string | null;
  currency: string;
  pricesIncludeTax: boolean;
  grossTotal: Money;
  discountTotal: Money;
  netTotal: Money;
  taxTotal: Money;
  total: Money;
  paidTotal: Money;
  changeGiven: Money;
  createdAt: string;
  lines: {
    id: string;
    lineNo: number;
    description: string;
    code: string;
    quantity: number;
    unitPrice: Money;
    discountPercent: Money;
    discountAmount: Money;
    taxRateName: string | null;
    taxRate: Money;
    taxAmount: Money;
    total: Money;
    picks: { variantId: string; locationId: string; quantity: number }[];
    returnLines: { quantity: number }[];
  }[];
  payments: { id: string; method: PaymentMethod; amount: Money; reference: string | null }[];
  creditNotes: { id: string; creditNumber: string; total: Money; createdAt: string }[];
}

// ---------------------------------------------------------------- returns

export type ReturnCondition = "GOOD" | "DAMAGED";

export interface CreditNote {
  id: string;
  creditNumber: string;
  reason: string | null;
  refundMethod: PaymentMethod;
  refundReference: string | null;
  netTotal: Money;
  taxTotal: Money;
  total: Money;
  createdAt: string;
  sale: { id: string; invoiceNumber: string; customerName: string | null; customerPhone: string | null; currency: string; createdAt: string };
  cashier: { id: string; name: string };
  lines: {
    id: string;
    quantity: number;
    condition: ReturnCondition;
    locationPath: string;
    taxAmount: Money;
    total: Money;
    saleLine: { description: string; code: string; quantity: number; unitPrice: Money };
  }[];
}

export interface CreditNoteListItem {
  id: string;
  creditNumber: string;
  total: Money;
  createdAt: string;
  sale: { id: string; invoiceNumber: string; customerName: string | null };
  cashier: { id: string; name: string };
}

// ---------------------------------------------------------------- stocktake

export type StocktakeStatus = "COUNTING" | "SUBMITTED" | "APPROVED" | "CANCELLED";

export interface Stocktake {
  id: string;
  code: string;
  status: StocktakeStatus;
  note: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  createdBy: { id: string; name: string };
  submittedBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  location: { id: string; path: string };
  spaces: { id: string; code: string; path: string }[];
  lines: {
    id: string;
    variantId: string;
    locationId: string;
    path: string;
    expected: number;
    counted: number | null;
    /** System stock now (or at approval). */
    onHand: number;
    variance: number | null;
    adjustment: number | null;
    variant: { id: string; kind: VariantKind; code: string; name: string; product: { id: string; name: string; images: string[] } };
  }[];
}

export interface StocktakeListItem {
  id: string;
  code: string;
  status: StocktakeStatus;
  createdAt: string;
  locationPath: string;
  createdBy: { name: string };
  _count: { lines: number };
}

// ---------------------------------------------------------------- orders

export type OrderStatus = "NEW" | "ALLOCATED" | "PICKING" | "LOADED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "RETURNED" | "CANCELLED";
export type OrderPayment = "PAID" | "UNPAID" | "COD";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: "neutral" | "ok" | "muted" | "brand" }> = {
  NEW: { label: "New", tone: "brand" },
  ALLOCATED: { label: "Stock reserved", tone: "neutral" },
  PICKING: { label: "Picking", tone: "brand" },
  LOADED: { label: "Loaded", tone: "ok" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", tone: "brand" },
  DELIVERED: { label: "Delivered", tone: "ok" },
  FAILED: { label: "Delivery failed", tone: "brand" },
  RETURNED: { label: "Returned", tone: "muted" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

export const PAYMENT_STATUS_LABELS: Record<OrderPayment, string> = {
  PAID: "Paid",
  UNPAID: "Not paid",
  COD: "Cash on delivery",
};

type VariantRef = { id: string; kind: VariantKind; code: string; name: string; product: { id: string; name: string; images: string[] } };

export interface OrderAllocation {
  id: string;
  lineId: string;
  variantId: string;
  locationId: string;
  quantity: number;
  picked: number;
  released: number;
  delivered: number;
  returned: number;
  path: string;
  site: string;
  locationCode: string;
  variant: VariantRef;
}

export interface Order {
  id: string;
  orderNumber: string;
  source: "MANUAL" | "WEBSITE";
  externalId: string | null;
  status: OrderStatus;
  customerName: string;
  customerPhone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  paymentStatus: OrderPayment;
  codAmount: Money | null;
  deliveryDate: string | null;
  timeWindow: string | null;
  shortReason: string | null;
  cancelReason: string | null;
  createdAt: string;
  driverId: string | null;
  driver: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  shortApprovedBy: { id: string; name: string } | null;
  startedAt: string | null;
  deliveredAt: string | null;
  deliveredBy: { id: string; name: string } | null;
  recipientName: string | null;
  codCollected: Money | null;
  deliveryNote: string | null;
  deliveryPhotoUrl: string | null;
  partialApprovedBy: { id: string; name: string } | null;
  failedReason: DeliveryExceptionType | null;
  exceptions: {
    id: string;
    type: DeliveryExceptionType;
    note: string;
    photoUrl: string | null;
    createdAt: string;
    reportedBy: { id: string; name: string };
    variant: { id: string; code: string; name: string } | null;
    location: { id: string; name: string } | null;
  }[];
  lines: { id: string; lineNo: number; variantId: string; description: string; quantity: number; unitPrice: Money | null; variant: VariantRef }[];
  allocations: OrderAllocation[];
  needs: { lineId: string; variantId: string; quantity: number; name: string; allocated: number; picked: number }[];
  inTransit: number;
  awaitingReturn: boolean;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  source: "MANUAL" | "WEBSITE";
  externalId: string | null;
  status: OrderStatus;
  customerName: string;
  address: string | null;
  deliveryDate: string | null;
  timeWindow: string | null;
  createdAt: string;
  customerPhone: string | null;
  paymentStatus: OrderPayment;
  codAmount: Money | null;
  deliveredAt: string | null;
  driver: { id: string; name: string } | null;
  _count: { lines: number };
  /** Sites the driver still has to collect from. */
  pickups: { site: string; items: number }[];
  inTransit: number;
}

export type DeliveryExceptionType = "MISSING_BOX" | "DAMAGED_BOX" | "CUSTOMER_REFUSED" | "NOT_HOME" | "WRONG_ADDRESS" | "OTHER";

export const EXCEPTION_LABELS: Record<DeliveryExceptionType, string> = {
  NOT_HOME: "Customer not home",
  CUSTOMER_REFUSED: "Customer refused",
  WRONG_ADDRESS: "Wrong / can't find address",
  MISSING_BOX: "Box missing",
  DAMAGED_BOX: "Box damaged",
  OTHER: "Other problem",
};

export interface AllocationSuggestion {
  allocations: { lineId: string; variantId: string; locationId: string; quantity: number; path?: string; site?: string }[];
  short: { lineId: string; variantId: string; quantity: number; missing: number }[];
  needs: { lineId: string; variantId: string; quantity: number; name: string }[];
  sources: { variantId: string; locationId: string; site: string; path: string; available: number }[];
}

// ---------------------------------------------------------------- reports, audit, dashboard

export type ReportFilterKey = "date" | "product" | "location" | "user" | "category";

export interface ReportInfo {
  type: string;
  title: string;
  group: string;
  description: string;
  filters: ReportFilterKey[];
  userLabel?: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  type: "text" | "number" | "money" | "datetime" | "date";
  total?: boolean;
}

export interface ReportResult {
  type: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, number> | null;
  truncated: boolean;
  generatedAt: string;
}

export interface ReportOptions {
  users: { id: string; name: string; role: Role; active: boolean }[];
  categories: { id: string; name: string }[];
  locations: { id: string; path: string }[];
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string; role: Role } | null;
}

export interface Dashboard {
  products: number;
  stockUnits: number;
  lowStock: number;
  lowStockTop: LowStockRow[];
  orders: { today: number; pending: number; readyForDelivery: number; outForDelivery: number; failed: number };
  websiteIssues: number;
  sales: { count: number; total: Money } | null;
  returns: { count: number; total: Money } | null;
  recentMovements: Movement[];
}

// ---------------------------------------------------------------- transfers

export type TransferStatus = "IN_TRANSIT" | "RECEIVED" | "CANCELLED";

export interface Transfer {
  id: string;
  code: string;
  status: TransferStatus;
  note: string | null;
  closedReason: string | null;
  sentAt: string;
  receivedAt: string | null;
  sentById: string;
  sentBy: { id: string; name: string };
  receivedBy: { id: string; name: string } | null;
  from: { id: string; path: string; siteId: string } | null;
  to: { id: string; path: string; siteId: string } | null;
  lines: {
    id: string;
    variantId: string;
    quantity: number;
    received: number;
    lost: number;
    variant: { id: string; kind: VariantKind; code: string; name: string; product: { id: string; name: string; images: string[] } };
  }[];
}

export interface TransferListItem {
  id: string;
  code: string;
  status: TransferStatus;
  sentAt: string;
  sentBy: { name: string };
  from: { id: string; path: string; siteId: string } | null;
  to: { id: string; path: string; siteId: string } | null;
  units: number;
  received: number;
  lost: number;
}

export interface LowStockRow {
  productId: string;
  name: string;
  image?: string;
  variantId: string;
  code: string;
  available: number;
  minStock: number;
}

export interface SalesSummary {
  salesCount: number;
  salesTotal: Money;
  returnsCount: number;
  returnsTotal: Money;
}

export interface SaleListItem {
  id: string;
  invoiceNumber: string;
  customerName: string | null;
  total: Money;
  createdAt: string;
  cashier: { id: string; name: string };
  _count: { lines: number };
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
