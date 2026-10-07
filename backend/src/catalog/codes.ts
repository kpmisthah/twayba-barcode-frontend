/** Internal code helpers. Codes are generated once and never change. */

export const CODE_PREFIX = 'TW';

/** 123 → "TW-000123" */
export function productCode(number: number): string {
  return `${CODE_PREFIX}-${String(number).padStart(6, '0')}`;
}

/** Variant n (1-based) of a product: "TW-000123-01". */
export function variantCode(base: string, n: number): string {
  return `${base}-${String(n).padStart(2, '0')}`;
}

/** 0 → A, 25 → Z, 26 → AA, 27 → AB … (spreadsheet-style). */
export function boxLetter(index: number): string {
  let n = index;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}

/** Box n (0-based) of a kit: "TW-000200-A". */
export function componentCode(base: string, index: number): string {
  return `${base}-${boxLetter(index)}`;
}

/** "Black", "Large" → "Black / Large"; nothing → "Default". */
export function variantName(color?: string | null, size?: string | null): string {
  const parts = [color?.trim(), size?.trim()].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Default';
}

/** "Box A", "Side panels" → "Box A – Side panels". */
export function componentName(index: number, label?: string | null): string {
  const box = `Box ${boxLetter(index)}`;
  return label?.trim() ? `${box} – ${label.trim()}` : box;
}
