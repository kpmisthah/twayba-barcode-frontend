import { Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import bwipjs from 'bwip-js';
import PDFDocument from 'pdfkit';
import { AppSettings, SettingsService } from '../settings/settings.service.js';
import { saleInclude, SalesService } from './sales.service.js';

type Sale = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;
type Doc = InstanceType<typeof PDFDocument>;

const PT_PER_MM = 72 / 25.4;

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  OTHER: 'Other',
};

/** Invoice (A4) and till receipt PDFs. Both are rendered from the stored sale, so they never change. */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly sales: SalesService,
    private readonly settings: SettingsService,
  ) {}

  async invoicePdf(saleId: string): Promise<Buffer> {
    const [sale, settings] = await Promise.all([this.sales.get(saleId), this.settings.getAll()]);
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Invoice ${sale.invoiceNumber}` } });
    const done = collect(doc);
    drawInvoice(doc, sale, settings);
    doc.end();
    return done;
  }

  async receiptPdf(saleId: string): Promise<Buffer> {
    const [sale, settings] = await Promise.all([this.sales.get(saleId), this.settings.getAll()]);
    const width = settings.receiptWidthMm * PT_PER_MM;
    // Scanning this at the till finds the invoice for a return.
    const barcode = await bwipjs.toBuffer({ bcid: 'code128', text: sale.invoiceNumber, scale: 3, height: 10, includetext: false });

    // Measure on a very long page first, then print on a page exactly as long as the receipt.
    const measure = new PDFDocument({ size: [width, 20_000], margin: 0 });
    const height = drawReceipt(measure, sale, settings, width, barcode);
    measure.end();

    const doc = new PDFDocument({ size: [width, height], margin: 0, info: { Title: `Receipt ${sale.invoiceNumber}` } });
    const done = collect(doc);
    drawReceipt(doc, sale, settings, width, barcode);
    doc.end();
    return done;
  }
}

function collect(doc: Doc): Promise<Buffer> {
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  return new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
}

function formatters(sale: Sale) {
  const money = new Intl.NumberFormat('en-MT', { style: 'currency', currency: sale.currency });
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Malta', dateStyle: 'medium', timeStyle: 'short' });
  return { money: (v: Prisma.Decimal | string | number) => money.format(Number(v)), date: (d: Date) => date.format(d) };
}

/** Net and VAT per rate, as required on a VAT invoice. */
function vatSummary(sale: Sale) {
  const byRate = new Map<string, { rate: number; net: number; tax: number }>();
  for (const l of sale.lines) {
    const rate = Number(l.taxRate);
    const key = rate.toFixed(2);
    const row = byRate.get(key) ?? { rate, net: 0, tax: 0 };
    row.tax += Number(l.taxAmount);
    row.net += Number(l.total) - Number(l.taxAmount);
    byRate.set(key, row);
  }
  return [...byRate.values()].sort((a, b) => b.rate - a.rate);
}

// ---------------------------------------------------------------- receipt

/** Draws the receipt and returns the height used (pt). */
function drawReceipt(doc: Doc, sale: Sale, s: AppSettings, width: number, barcode: Buffer): number {
  const { money, date } = formatters(sale);
  const pad = 3 * PT_PER_MM;
  const inner = width - pad * 2;
  const size = width < 60 * PT_PER_MM ? 7 : 8;
  let y = pad;

  const text = (t: string, opts: { bold?: boolean; align?: 'left' | 'center' | 'right'; sizeBoost?: number } = {}) => {
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size + (opts.sizeBoost ?? 0));
    doc.text(t, pad, y, { width: inner, align: opts.align ?? 'left' });
    y = doc.y + 1;
  };
  const row = (left: string, right: string, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? size + 1 : size);
    const rightWidth = doc.widthOfString(right) + 2;
    doc.text(left, pad, y, { width: inner - rightWidth - 4 });
    const afterLeft = doc.y;
    doc.text(right, pad, y, { width: inner, align: 'right' });
    y = Math.max(afterLeft, doc.y) + 1;
  };
  const rule = () => {
    y += 2;
    doc.moveTo(pad, y).lineTo(width - pad, y).dash(1.5, { space: 1.5 }).lineWidth(0.5).stroke().undash();
    y += 4;
  };

  text(s.businessName, { bold: true, align: 'center', sizeBoost: 4 });
  for (const line of [s.businessAddress, s.businessPhone && `Tel ${s.businessPhone}`, s.vatNumber && `VAT ${s.vatNumber}`]) {
    if (line) text(line, { align: 'center' });
  }
  rule();
  row('Invoice', sale.invoiceNumber, true);
  text(date(sale.createdAt));
  text(`Served by ${sale.cashier.name}${sale.site ? ` · ${sale.site.name}` : ''}`);
  if (sale.customerName || sale.customerPhone) text(`Customer: ${[sale.customerName, sale.customerPhone].filter(Boolean).join(', ')}`);
  rule();

  for (const l of sale.lines) {
    text(l.description, { bold: true });
    row(`  ${l.quantity} × ${money(l.unitPrice)}`, money(Number(l.unitPrice) * l.quantity));
    if (Number(l.discountAmount) > 0) row(`  Discount ${Number(l.discountPercent)}%`, `-${money(l.discountAmount)}`);
  }
  rule();
  if (Number(sale.discountTotal) > 0) row('Discount', `-${money(sale.discountTotal)}`);
  row('Total excl. VAT', money(sale.netTotal));
  for (const v of vatSummary(sale)) row(`VAT ${v.rate}%`, money(v.tax));
  row('TOTAL', money(sale.total), true);
  rule();
  for (const p of sale.payments) row(PAYMENT_LABELS[p.method] + (p.reference ? ` (${p.reference})` : ''), money(p.amount));
  if (Number(sale.changeGiven) > 0) row('Change', money(sale.changeGiven), true);
  if (s.receiptFooter) {
    rule();
    text(s.receiptFooter, { align: 'center' });
  }
  // Invoice number as a barcode, with blank margins either side so scanners can read it.
  y += 4;
  const quiet = 4 * PT_PER_MM;
  const barHeight = 10 * PT_PER_MM;
  doc.image(barcode, quiet, y, { fit: [width - quiet * 2, barHeight], align: 'center' });
  y += barHeight + 2;
  text(sale.invoiceNumber, { align: 'center' });
  return y + pad;
}

// ---------------------------------------------------------------- A4 invoice

function drawInvoice(doc: Doc, sale: Sale, s: AppSettings) {
  const { money, date } = formatters(sale);
  const left = 50;
  const right = doc.page.width - 50;
  const width = right - left;
  const cols = [
    { label: 'Description', x: left, w: 215, align: 'left' as const },
    { label: 'Qty', x: left + 215, w: 35, align: 'right' as const },
    { label: 'Unit price', x: left + 250, w: 70, align: 'right' as const },
    { label: 'Discount', x: left + 320, w: 60, align: 'right' as const },
    { label: 'VAT', x: left + 380, w: 40, align: 'right' as const },
    { label: 'Total', x: left + 420, w: width - 420, align: 'right' as const },
  ];

  // Header: business (left), invoice details (right)
  doc.font('Helvetica-Bold').fontSize(18).text(s.businessName, left, 50, { width: width / 2 });
  doc.font('Helvetica').fontSize(9).fillColor('#444');
  for (const line of [s.businessAddress, s.businessPhone && `Tel ${s.businessPhone}`, s.vatNumber && `VAT No. ${s.vatNumber}`]) {
    if (line) doc.text(line, { width: width / 2 });
  }
  const headerBottom = doc.y;
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(20).text('INVOICE', left, 50, { width, align: 'right' });
  doc.font('Helvetica').fontSize(10);
  doc.text(sale.invoiceNumber, { width, align: 'right' });
  doc.text(date(sale.createdAt), { width, align: 'right' });
  if (sale.site) doc.text(sale.site.name, { width, align: 'right' });

  let y = Math.max(headerBottom, doc.y) + 25;
  if (sale.customerName || sale.customerPhone) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text('BILL TO', left, y);
    doc.font('Helvetica').fontSize(10).fillColor('#000');
    for (const line of [sale.customerName, sale.customerPhone]) if (line) doc.text(line);
    y = doc.y + 20;
  }

  const tableHeader = () => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444');
    for (const c of cols) doc.text(c.label, c.x, y, { width: c.w, align: c.align });
    y += 14;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.7).strokeColor('#999').stroke();
    y += 6;
    doc.fillColor('#000');
  };
  tableHeader();

  doc.font('Helvetica').fontSize(9.5);
  for (const l of sale.lines) {
    const descHeight = doc.heightOfString(`${l.description}\n${l.code}`, { width: cols[0].w - 6 });
    if (y + descHeight > doc.page.height - 120) {
      doc.addPage();
      y = 50;
      tableHeader();
      doc.font('Helvetica').fontSize(9.5);
    }
    doc.text(l.description, cols[0].x, y, { width: cols[0].w - 6 });
    doc.fillColor('#777').fontSize(8).text(l.code, { width: cols[0].w - 6 }).fillColor('#000').fontSize(9.5);
    const cells = [
      String(l.quantity),
      money(l.unitPrice),
      Number(l.discountAmount) > 0 ? `-${money(l.discountAmount)}` : '',
      `${Number(l.taxRate)}%`,
      money(l.total),
    ];
    cells.forEach((v, i) => doc.text(v, cols[i + 1].x, y, { width: cols[i + 1].w, align: cols[i + 1].align }));
    y += Math.max(descHeight, 12) + 8;
  }
  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.7).strokeColor('#999').stroke();
  y += 12;

  // Totals (right) and VAT summary (left)
  if (y > doc.page.height - 200) {
    doc.addPage();
    y = 50;
  }
  const totalsX = left + 300;
  const totalsW = width - 300;
  const totalRow = (label: string, value: string, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10);
    doc.text(label, totalsX, y, { width: totalsW / 2 });
    doc.text(value, totalsX, y, { width: totalsW, align: 'right' });
    y += bold ? 18 : 15;
  };
  const summaryTop = y;
  if (Number(sale.discountTotal) > 0) totalRow('Discount', `-${money(sale.discountTotal)}`);
  totalRow('Total excl. VAT', money(sale.netTotal));
  totalRow('VAT', money(sale.taxTotal));
  totalRow(`Total (${sale.currency})`, money(sale.total), true);
  y += 6;
  for (const p of sale.payments) totalRow(`Paid – ${PAYMENT_LABELS[p.method]}`, money(p.amount));
  if (Number(sale.changeGiven) > 0) totalRow('Change', money(sale.changeGiven));
  const totalsBottom = y;

  y = summaryTop;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text('VAT SUMMARY', left, y);
  y += 14;
  doc.font('Helvetica').fontSize(9).fillColor('#000');
  for (const v of vatSummary(sale)) {
    doc.text(`${v.rate}%   on ${money(v.net)}   = ${money(v.tax)}`, left, y, { width: 240 });
    y += 13;
  }
  doc.fillColor('#777').text(`Served by ${sale.cashier.name}`, left, y + 6, { width: 240 });

  y = Math.max(totalsBottom, y) + 30;
  if (s.receiptFooter) {
    doc.font('Helvetica').fontSize(9).fillColor('#444').text(s.receiptFooter, left, y, { width, align: 'center' });
  }
}
