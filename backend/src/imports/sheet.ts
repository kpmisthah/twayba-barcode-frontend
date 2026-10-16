import { Readable } from 'node:stream';
import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

export const MAX_IMPORT_ROWS = 5000;

export interface SheetRow {
  /** Row number as the user sees it in Excel (header is row 1). */
  row: number;
  values: Record<string, string>;
}

/** Header text → our key, ignoring case, spaces, '*' and punctuation ("Product name *" → "productname"). */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Reads the first sheet of an .xlsx file, or a .csv file, into rows keyed by column.
 * `columns` maps our keys to the header texts we accept for them.
 */
export async function readSheet(file: Buffer, columns: Record<string, string[]>): Promise<SheetRow[]> {
  const wb = new ExcelJS.Workbook();
  const isXlsx = file.subarray(0, 2).toString('latin1') === 'PK'; // .xlsx is a zip file
  try {
    if (isXlsx) await wb.xlsx.load(file as unknown as ArrayBuffer);
    // Keep every CSV value as text: "00123" or a 16-digit barcode must not become a number.
    else await wb.csv.read(Readable.from(file.toString('utf8').replace(/^﻿/, '')), { map: (value: unknown) => value } as never);
  } catch {
    throw new BadRequestException('Could not read the file — save it as Excel (.xlsx) or CSV');
  }
  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount < 2) throw new BadRequestException('The file has no rows under the header');

  // Find the header row (the template has an instructions line above it).
  const wanted = new Map<string, string>();
  for (const [key, labels] of Object.entries(columns)) for (const l of labels) wanted.set(norm(l), key);
  let headerRow = 0;
  let colKeys: (string | undefined)[] = [];
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    const cells = (ws.getRow(r).values as unknown[]).slice(1).map((v) => wanted.get(norm(cellText(v))));
    if (cells.filter(Boolean).length >= 2) {
      headerRow = r;
      colKeys = cells;
      break;
    }
  }
  if (!headerRow) {
    throw new BadRequestException(`Header row not found. Use the template — expected columns like: ${Object.values(columns).map((l) => l[0]).join(', ')}`);
  }

  const rows: SheetRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const raw = (ws.getRow(r).values as unknown[]).slice(1);
    const values: Record<string, string> = Object.fromEntries(colKeys.filter((k): k is string => !!k).map((k) => [k, '']));
    raw.forEach((v, i) => {
      const key = colKeys[i];
      if (key) values[key] = cellText(v).trim();
    });
    if (Object.values(values).every((v) => !v)) continue; // blank line
    rows.push({ row: r, values });
    if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`Import at most ${MAX_IMPORT_ROWS} rows at a time`);
  }
  if (!rows.length) throw new BadRequestException('The file has no rows under the header');
  return rows;
}

/** Excel cells can be numbers, dates, rich text or formulas — turn them into plain text. */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.result !== undefined) return cellText(o.result);
    if (o.text !== undefined) return String(o.text);
  }
  return String(v);
}

/** "12,50", "€12.50", "12.5" → 12.5; empty → null; invalid → NaN. */
export function parseNumber(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[€\s]/g, '').replace(/,(\d{1,2})$/, '.$1').replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * A downloadable template: an instructions line, a bold header and example rows.
 * `textColumns` (0-based) are formatted as Text so Excel keeps leading zeros in codes.
 */
export async function templateXlsx(
  sheetName: string,
  instructions: string,
  headers: string[],
  examples: (string | number)[][],
  textColumns: number[] = [],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow([instructions]).font = { italic: true, color: { argb: 'FF666666' } };
  const header = ws.addRow(headers);
  header.font = { bold: true };
  header.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F5F9' } }));
  for (const e of examples) ws.addRow(e);
  headers.forEach((h, i) => (ws.getColumn(i + 1).width = Math.max(14, h.length + 4)));
  for (const i of textColumns) ws.getColumn(i + 1).numFmt = '@';
  ws.views = [{ state: 'frozen', ySplit: 2 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
