import { fromCents, priceLine, settle, sumLines, toCents } from './pricing.js';

describe('POS pricing', () => {
  it('splits VAT out of a VAT-inclusive price (Malta 18%)', () => {
    // €118.00 incl. 18% VAT = €100.00 + €18.00
    expect(priceLine({ unitCents: 11800, quantity: 1, discountPercent: 0, taxRate: 18 }, true)).toEqual({
      grossCents: 11800,
      discountCents: 0,
      netCents: 10000,
      taxCents: 1800,
      totalCents: 11800,
    });
  });

  it('adds VAT on top when prices exclude it', () => {
    const l = priceLine({ unitCents: 10000, quantity: 2, discountPercent: 0, taxRate: 18 }, false);
    expect(l).toMatchObject({ netCents: 20000, taxCents: 3600, totalCents: 23600 });
  });

  it('applies the discount before VAT', () => {
    // 2 × €49.50 = €99.00, 10% off = €89.10 incl. VAT
    const l = priceLine({ unitCents: 4950, quantity: 2, discountPercent: 10, taxRate: 18 }, true);
    expect(l.discountCents).toBe(990);
    expect(l.totalCents).toBe(8910);
    expect(l.netCents + l.taxCents).toBe(l.totalCents);
  });

  it('handles fractional rates exactly (7.5% VAT, 12.25% discount)', () => {
    const l = priceLine({ unitCents: 2000, quantity: 3, discountPercent: 12.25, taxRate: 7.5 }, false);
    expect(l.discountCents).toBe(735); // 6000 × 12.25%
    expect(l.taxCents).toBe(395); // 5265 × 7.5% = 394.875 → 395
    expect(l.totalCents).toBe(5660);
  });

  it('treats a missing tax rate as 0%', () => {
    expect(priceLine({ unitCents: 999, quantity: 1, discountPercent: 0, taxRate: 0 }, true)).toMatchObject({ taxCents: 0, netCents: 999 });
  });

  it('sums lines', () => {
    const t = sumLines([
      priceLine({ unitCents: 11800, quantity: 1, discountPercent: 0, taxRate: 18 }, true),
      priceLine({ unitCents: 500, quantity: 2, discountPercent: 0, taxRate: 0 }, true),
    ]);
    expect(t).toMatchObject({ totalCents: 12800, taxCents: 1800, netCents: 11000 });
  });

  it('converts money without float errors', () => {
    expect(toCents('19.99')).toBe(1999);
    expect(toCents('0.29')).toBe(29);
    expect(fromCents(1999)).toBe('19.99');
  });

  it('settles payments: exact, split, cash change', () => {
    expect(settle(5000, [{ method: 'CARD', cents: 5000 }])).toEqual({ paidCents: 5000, changeCents: 0 });
    expect(settle(5000, [{ method: 'CARD', cents: 3000 }, { method: 'CASH', cents: 2000 }])).toEqual({ paidCents: 5000, changeCents: 0 });
    expect(settle(4550, [{ method: 'CASH', cents: 5000 }])).toEqual({ paidCents: 5000, changeCents: 450 });
  });

  it('rejects short payment and non-cash overpayment', () => {
    expect(() => settle(5000, [{ method: 'CASH', cents: 4000 }])).toThrow('10.00 still to pay');
    expect(() => settle(5000, [{ method: 'CARD', cents: 6000 }])).toThrow('Only cash');
    expect(() => settle(5000, [{ method: 'CARD', cents: 5500 }, { method: 'CASH', cents: 100 }])).toThrow('Only cash');
    expect(() => settle(5000, [{ method: 'CASH', cents: 0 }])).toThrow('more than 0');
  });
});
