import { boxesPerUnit, refundFor } from './refund.js';

const none = { quantity: 0, totalCents: 0, taxCents: 0 };

describe('refunds', () => {
  it('refunds the share actually paid (after discount)', () => {
    // 3 chairs, €49.50 each, 10% off → €133.65 charged
    expect(refundFor({ quantity: 3, totalCents: 13365, taxCents: 2039 }, none, 1)).toEqual({ totalCents: 4455, taxCents: 680 });
  });

  it('never refunds more or less than paid across several returns', () => {
    const sold = { quantity: 3, totalCents: 10000, taxCents: 1525 };
    const first = refundFor(sold, none, 1); // 3333
    const second = refundFor(sold, { quantity: 1, ...first }, 1); // 3333
    const last = refundFor(sold, { quantity: 2, totalCents: first.totalCents + second.totalCents, taxCents: first.taxCents + second.taxCents }, 1);
    expect(first.totalCents + second.totalCents + last.totalCents).toBe(10000);
    expect(first.taxCents + second.taxCents + last.taxCents).toBe(1525);
  });

  it('blocks returning more than sold minus already returned', () => {
    const sold = { quantity: 2, totalCents: 2000, taxCents: 305 };
    expect(() => refundFor(sold, none, 3)).toThrow('Only 2 left');
    expect(() => refundFor(sold, { quantity: 2, totalCents: 2000, taxCents: 305 }, 1)).toThrow('Already fully returned');
    expect(() => refundFor(sold, none, 0)).toThrow('at least 1');
  });

  it('works out boxes per kit from the sale picks', () => {
    const m = boxesPerUnit(
      [
        { variantId: 'A', quantity: 3 },
        { variantId: 'A', quantity: 1 },
        { variantId: 'B', quantity: 2 },
      ],
      2,
    );
    expect(Object.fromEntries(m)).toEqual({ A: 2, B: 1 });
  });
});
