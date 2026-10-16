/**
 * POS money maths in whole cents (never floating-point euros).
 * Percentages are handled in hundredths of a percent, so 7.5% VAT or 12.25% discount are exact.
 */

export interface LineInput {
  unitCents: number;
  quantity: number;
  discountPercent: number;
  /** VAT rate in percent, e.g. 18. */
  taxRate: number;
}

export interface PricedLine {
  grossCents: number;
  discountCents: number;
  /** Excluding VAT, after discount. */
  netCents: number;
  taxCents: number;
  /** Including VAT. */
  totalCents: number;
}

const basisPoints = (percent: number) => Math.round(percent * 100);

export function toCents(amount: string | number | { toString(): string }): number {
  return Math.round(Number(amount.toString()) * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function priceLine(line: LineInput, pricesIncludeTax: boolean): PricedLine {
  const grossCents = line.unitCents * line.quantity;
  const discountCents = Math.round((grossCents * basisPoints(line.discountPercent)) / 10_000);
  const afterDiscount = grossCents - discountCents;
  const rate = basisPoints(line.taxRate);

  if (pricesIncludeTax) {
    const taxCents = Math.round((afterDiscount * rate) / (10_000 + rate));
    return { grossCents, discountCents, netCents: afterDiscount - taxCents, taxCents, totalCents: afterDiscount };
  }
  const taxCents = Math.round((afterDiscount * rate) / 10_000);
  return { grossCents, discountCents, netCents: afterDiscount, taxCents, totalCents: afterDiscount + taxCents };
}

export function sumLines(lines: PricedLine[]): PricedLine {
  return lines.reduce(
    (t, l) => ({
      grossCents: t.grossCents + l.grossCents,
      discountCents: t.discountCents + l.discountCents,
      netCents: t.netCents + l.netCents,
      taxCents: t.taxCents + l.taxCents,
      totalCents: t.totalCents + l.totalCents,
    }),
    { grossCents: 0, discountCents: 0, netCents: 0, taxCents: 0, totalCents: 0 },
  );
}

export interface PaymentInput {
  method: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
  cents: number;
}

/** Payments must cover the total; only cash can be more than what's due (the rest is change). */
export function settle(totalCents: number, payments: PaymentInput[]): { paidCents: number; changeCents: number } {
  if (payments.some((p) => !Number.isInteger(p.cents) || p.cents <= 0)) throw new Error('Each payment must be more than 0');
  const paidCents = payments.reduce((sum, p) => sum + p.cents, 0);
  if (paidCents < totalCents) throw new Error(`${fromCents(totalCents - paidCents)} still to pay`);
  const changeCents = paidCents - totalCents;
  const cashCents = payments.filter((p) => p.method === 'CASH').reduce((sum, p) => sum + p.cents, 0);
  if (changeCents > cashCents) throw new Error('Only cash can be more than the amount due');
  return { paidCents, changeCents };
}
