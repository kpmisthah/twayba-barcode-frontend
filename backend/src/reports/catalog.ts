export type FilterKey = 'date' | 'product' | 'location' | 'user' | 'category';

export interface ReportInfo {
  type: string;
  title: string;
  group: 'Sales' | 'Stock' | 'Orders & deliveries' | 'Control';
  description: string;
  filters: FilterKey[];
  /** What the "user" filter means for this report. */
  userLabel?: string;
}

/** Every report (spec §11). The order here is the order on the Reports page. */
export const REPORTS: ReportInfo[] = [
  { type: 'sales', group: 'Sales', title: 'Sales (invoices)', description: 'Every invoice with VAT and payment.', filters: ['date', 'user', 'location', 'product', 'category'], userLabel: 'Cashier' },
  { type: 'sales-by-day', group: 'Sales', title: 'POS sales by day', description: 'Sales, returns and net takings per day.', filters: ['date', 'user', 'location'], userLabel: 'Cashier' },
  { type: 'channel-summary', group: 'Sales', title: 'Daily summary by channel', description: 'Per day: shop sales, website and manual orders delivered, and returns.', filters: ['date'] },
  { type: 'sales-by-cashier', group: 'Sales', title: 'Sales by cashier', description: 'What each salesperson sold.', filters: ['date', 'location'] },
  { type: 'sales-by-product', group: 'Sales', title: 'Sales by product', description: 'Quantities and value sold per item.', filters: ['date', 'user', 'location', 'product', 'category'], userLabel: 'Cashier' },
  { type: 'returns', group: 'Sales', title: 'Returns', description: 'Credit notes: what came back, condition and refund.', filters: ['date', 'user', 'product', 'category'], userLabel: 'Processed by' },
  { type: 'inventory', group: 'Stock', title: 'Inventory', description: 'Stock of every item: in store, reserved, in transit, damaged (and value).', filters: ['location', 'product', 'category'] },
  { type: 'stock-by-location', group: 'Stock', title: 'Stock by location', description: 'What is on every shelf and space.', filters: ['location', 'product', 'category'] },
  { type: 'low-stock', group: 'Stock', title: 'Low stock', description: 'Items below their minimum stock.', filters: ['category'] },
  { type: 'movements', group: 'Stock', title: 'Stock movements', description: 'Every stock change: who, what, when, where, why.', filters: ['date', 'user', 'location', 'product', 'category'], userLabel: 'Done by' },
  { type: 'damaged', group: 'Stock', title: 'Damaged stock', description: 'What is in the Damaged location now.', filters: ['product', 'category'] },
  { type: 'stocktake-variance', group: 'Stock', title: 'Stocktake differences', description: 'Corrections made by approved stocktakes.', filters: ['date', 'location', 'product', 'category'] },
  { type: 'incomplete-kits', group: 'Stock', title: 'Incomplete kits', description: 'Spare boxes that do not make a complete kit.', filters: ['product', 'category'] },
  { type: 'orders', group: 'Orders & deliveries', title: 'Orders', description: 'Orders created, with status and driver.', filters: ['date', 'user', 'product'], userLabel: 'Driver' },
  { type: 'in-transit', group: 'Orders & deliveries', title: 'On the vans / in transit', description: 'What is on each driver’s van right now, and transfers on the way.', filters: ['user'], userLabel: 'Driver' },
  { type: 'deliveries', group: 'Orders & deliveries', title: 'Deliveries', description: 'Delivered and failed orders, cash collected vs expected.', filters: ['date', 'user'], userLabel: 'Driver' },
  { type: 'picking-errors', group: 'Control', title: 'Picking errors', description: 'Rejected pick scans: wrong item, box or place, or too many.', filters: ['date', 'user'], userLabel: 'Picker' },
  { type: 'overrides', group: 'Control', title: 'Overrides & approvals', description: 'Every manager approval: discounts, pick location, missing boxes, partial deliveries.', filters: ['date', 'user'], userLabel: 'Done by' },
];

export type ColumnType = 'text' | 'number' | 'money' | 'datetime' | 'date';

export interface Column {
  key: string;
  label: string;
  type: ColumnType;
  /** Add up this column in a totals row. */
  total?: boolean;
}

export type Row = Record<string, string | number | null>;

export interface ReportResult {
  type: string;
  title: string;
  columns: Column[];
  rows: Row[];
  totals: Row | null;
  /** True when more rows matched than are returned. */
  truncated: boolean;
  generatedAt: string;
}

export interface ReportFilters {
  from?: string;
  to?: string;
  productId?: string;
  locationId?: string;
  userId?: string;
  categoryId?: string;
}
