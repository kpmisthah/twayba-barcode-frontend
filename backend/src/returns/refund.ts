export interface Amounts {
  quantity: number;
  totalCents: number;
  taxCents: number;
}

/**
 * Refund for returning `quantity` units of an invoice line: the share of what was actually
 * charged (after discount). The last units returned get exactly what's left, so rounding can
 * never refund more — or less — than the customer paid.
 */
export function refundFor(sold: Amounts, alreadyReturned: Amounts, quantity: number): { totalCents: number; taxCents: number } {
  const left = sold.quantity - alreadyReturned.quantity;
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Return at least 1');
  if (quantity > left) throw new Error(left === 0 ? 'Already fully returned' : `Only ${left} left to return`);
  if (quantity === left) {
    return { totalCents: sold.totalCents - alreadyReturned.totalCents, taxCents: sold.taxCents - alreadyReturned.taxCents };
  }
  return {
    totalCents: Math.round((sold.totalCents * quantity) / sold.quantity),
    taxCents: Math.round((sold.taxCents * quantity) / sold.quantity),
  };
}

/** How many of each box one kit unit used, from where the boxes were picked at sale time. */
export function boxesPerUnit(picks: { variantId: string; quantity: number }[], lineQuantity: number): Map<string, number> {
  const totals = new Map<string, number>();
  for (const p of picks) totals.set(p.variantId, (totals.get(p.variantId) ?? 0) + p.quantity);
  return new Map([...totals].map(([id, n]) => [id, n / lineQuantity]));
}
