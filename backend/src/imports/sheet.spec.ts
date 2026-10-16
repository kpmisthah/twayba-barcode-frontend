import { parseNumber, readSheet } from './sheet.js';

const cols = { name: ['Product name'], price: ['Price'], sku: ['SKU'] };

describe('import sheets', () => {
  it('reads CSV with an instructions line above the header and skips blank lines', async () => {
    const csv = 'Fill in one row per item\nProduct name *,SKU,Price\nChair,CH-1,49.50\n,,\nTable,,120\n';
    const rows = await readSheet(Buffer.from(csv), cols);
    expect(rows).toEqual([
      { row: 3, values: { name: 'Chair', sku: 'CH-1', price: '49.50' } },
      { row: 5, values: { name: 'Table', sku: '', price: '120' } },
    ]);
  });

  it('keeps codes as text (leading zeros, long barcodes)', async () => {
    const rows = await readSheet(Buffer.from('Product name,SKU,Price\nBox,00123,5\nCase,1234567890123456789,7\n'), cols);
    expect(rows.map((r) => r.values.sku)).toEqual(['00123', '1234567890123456789']);
  });

  it('handles a UTF-8 BOM (Excel "CSV UTF-8")', async () => {
    const rows = await readSheet(Buffer.from('﻿Product name,Price\nLamp,20\n'), cols);
    expect(rows[0].values.name).toBe('Lamp');
  });

  it('rejects a file without a recognisable header', async () => {
    await expect(readSheet(Buffer.from('a,b\n1,2\n'), cols)).rejects.toThrow('Header row not found');
  });

  it('parses prices written the European or Excel way', () => {
    expect(parseNumber('49.50')).toBe(49.5);
    expect(parseNumber('€ 49,50')).toBe(49.5);
    expect(parseNumber('1,250.00')).toBe(1250);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNaN();
  });
});
