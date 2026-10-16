export interface KitBox {
  variantId: string;
  /** How many of this box one kit needs. */
  perKit: number;
  available: number;
}

/**
 * Sellable kits = the smallest "available ÷ needed" over all boxes.
 * Leftover boxes that can't make a full kit are "spare" (reported as incomplete kits).
 * 10 × A, 10 × B, 7 × C (1 each) → 7 sellable; 3 A and 3 B spare.
 */
export function kitAvailability(boxes: KitBox[]) {
  const sellable = boxes.length ? Math.max(0, Math.min(...boxes.map((b) => Math.floor(b.available / b.perKit)))) : 0;
  return {
    sellable,
    boxes: boxes.map((b) => ({ ...b, spare: Math.max(0, b.available - sellable * b.perKit) })),
  };
}
