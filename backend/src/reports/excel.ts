import ExcelJS from 'exceljs';
import { ReportResult } from './catalog.js';
import { maltaWallClock } from './dates.js';

const FORMATS = {
  money: '#,##0.00',
  number: '#,##0',
  datetime: 'dd/mm/yyyy hh:mm',
  date: 'dd/mm/yyyy',
} as const;

/** A real .xlsx: title, filters used, bold header, typed cells (dates/money), totals row. */
export async function reportToXlsx(report: ReportResult, subtitle: string, businessName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = businessName;
  wb.created = new Date();
  const ws = wb.addWorksheet(report.title.replace(/[\\/?*[\]:]/g, '').slice(0, 31));

  ws.addRow([`${businessName} — ${report.title}`]).font = { bold: true, size: 14 };
  ws.addRow([subtitle]).font = { color: { argb: 'FF666666' } };
  if (report.truncated) ws.addRow([`Only the first ${report.rows.length} rows are included — narrow the filters to see the rest.`]).font = { color: { argb: 'FFC42B2B' } };
  ws.addRow([]);

  const header = ws.addRow(report.columns.map((c) => c.label));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F5F9' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD9DEE8' } } };
  });
  const headerRow = header.number;

  for (const row of report.rows) {
    ws.addRow(
      report.columns.map((c) => {
        const v = row[c.key];
        if (v === null || v === undefined || v === '') return null;
        if (c.type === 'datetime') return maltaWallClock(new Date(String(v)));
        if (c.type === 'date') return new Date(`${String(v).slice(0, 10)}T00:00:00Z`);
        return v;
      }),
    );
  }
  if (report.totals) {
    const totals = ws.addRow(report.columns.map((c, i) => (i === 0 ? 'Total' : (report.totals![c.key] ?? null))));
    totals.font = { bold: true };
    totals.eachCell((cell) => (cell.border = { top: { style: 'thin' } }));
  }

  report.columns.forEach((c, i) => {
    const column = ws.getColumn(i + 1);
    if (c.type !== 'text') column.numFmt = FORMATS[c.type];
    const longest = Math.max(c.label.length, ...report.rows.slice(0, 500).map((r) => String(r[c.key] ?? '').length));
    column.width = Math.min(50, Math.max(10, c.type === 'datetime' ? 17 : longest + 2));
  });
  ws.views = [{ state: 'frozen', ySplit: headerRow }];
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: report.columns.length } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
