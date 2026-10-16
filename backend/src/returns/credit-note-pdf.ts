import { Prisma, ReturnCondition } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PAYMENT_LABELS } from '../sales/documents.service.js';
import type { AppSettings } from '../settings/settings.service.js';
import { creditNoteInclude } from './returns.service.js';

type CreditNote = Prisma.CreditNoteGetPayload<{ include: typeof creditNoteInclude }> & {
  lines: { locationPath: string }[];
};

/** A4 credit note: what came back, the refund and how it was paid out. */
export function renderCreditNote(note: CreditNote, s: AppSettings): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Credit note ${note.creditNumber}` } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const money = new Intl.NumberFormat('en-MT', { style: 'currency', currency: note.sale.currency });
  const fmt = (v: Prisma.Decimal | string) => money.format(Number(v));
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Malta', dateStyle: 'medium', timeStyle: 'short' });
  const left = 50;
  const right = doc.page.width - 50;
  const width = right - left;

  doc.font('Helvetica-Bold').fontSize(18).text(s.businessName, left, 50, { width: width / 2 });
  doc.font('Helvetica').fontSize(9).fillColor('#444');
  for (const line of [s.businessAddress, s.businessPhone && `Tel ${s.businessPhone}`, s.vatNumber && `VAT No. ${s.vatNumber}`]) {
    if (line) doc.text(line, { width: width / 2 });
  }
  const headerBottom = doc.y;
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(20).text('CREDIT NOTE', left, 50, { width, align: 'right' });
  doc.font('Helvetica').fontSize(10);
  doc.text(note.creditNumber, { width, align: 'right' });
  doc.text(date.format(note.createdAt), { width, align: 'right' });
  doc.text(`For invoice ${note.sale.invoiceNumber} (${date.format(note.sale.createdAt)})`, { width, align: 'right' });

  let y = Math.max(headerBottom, doc.y) + 25;
  if (note.sale.customerName || note.sale.customerPhone) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text('CUSTOMER', left, y);
    doc.font('Helvetica').fontSize(10).fillColor('#000');
    for (const line of [note.sale.customerName, note.sale.customerPhone]) if (line) doc.text(line);
    y = doc.y + 20;
  }

  const cols = [
    { label: 'Item', x: left, w: 230, align: 'left' as const },
    { label: 'Qty', x: left + 230, w: 40, align: 'right' as const },
    { label: 'Condition', x: left + 280, w: 70, align: 'left' as const },
    { label: 'VAT', x: left + 350, w: 70, align: 'right' as const },
    { label: 'Refund', x: left + 420, w: width - 420, align: 'right' as const },
  ];
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#444');
  for (const c of cols) doc.text(c.label, c.x, y, { width: c.w, align: c.align });
  y += 14;
  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.7).strokeColor('#999').stroke();
  y += 6;

  doc.fillColor('#000').font('Helvetica').fontSize(9.5);
  for (const l of note.lines) {
    if (y > doc.page.height - 160) {
      doc.addPage();
      y = 50;
    }
    const startY = y;
    doc.text(l.saleLine.description, cols[0].x, y, { width: cols[0].w - 6 });
    doc.fillColor('#777').fontSize(8).text(`${l.saleLine.code} · back to ${l.locationPath}`, { width: cols[0].w - 6 });
    doc.fillColor('#000').fontSize(9.5);
    const bottom = doc.y;
    doc.text(String(l.quantity), cols[1].x, startY, { width: cols[1].w, align: 'right' });
    doc.text(l.condition === ReturnCondition.GOOD ? 'Good' : 'Damaged', cols[2].x + 10, startY, { width: cols[2].w });
    doc.text(fmt(l.taxAmount), cols[3].x, startY, { width: cols[3].w, align: 'right' });
    doc.text(fmt(l.total), cols[4].x, startY, { width: cols[4].w, align: 'right' });
    y = Math.max(bottom, startY + 12) + 8;
  }
  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.7).strokeColor('#999').stroke();
  y += 12;

  const row = (label: string, value: string, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10);
    doc.text(label, left + 300, y, { width: (width - 300) / 2 });
    doc.text(value, left + 300, y, { width: width - 300, align: 'right' });
    y += bold ? 18 : 15;
  };
  row('Refund excl. VAT', fmt(note.netTotal));
  row('VAT', fmt(note.taxTotal));
  row('Total refunded', fmt(note.total), true);
  row(`Refunded by ${PAYMENT_LABELS[note.refundMethod]}`, note.refundReference ?? '');

  doc.font('Helvetica').fontSize(9).fillColor('#444');
  if (note.reason) doc.text(`Reason: ${note.reason}`, left, y + 10, { width });
  doc.text(`Processed by ${note.cashier.name}`, left, doc.y + 4, { width });

  doc.end();
  return done;
}
