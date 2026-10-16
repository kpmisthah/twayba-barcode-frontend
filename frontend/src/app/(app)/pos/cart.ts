/** POS cart model. Prices are never computed here — the API prices the cart (/sales/preview). */

export interface Pick {
  locationId: string;
  /** "Room 1 › Shelf A › A1" (without the site). */
  where: string;
  quantity: number;
}

export interface ItemLine {
  key: string;
  kind: "STANDARD";
  productId: string;
  variantId: string;
  name: string;
  code: string;
  image?: string;
  discountPercent: number;
  /** One entry per space the units were taken from. Quantity = sum of picks. */
  picks: Pick[];
}

export interface KitBox {
  variantId: string;
  name: string;
  perKit: number;
  picks: Pick[];
}

/** One whole kit (always quantity 1); every box must be scanned/picked before checkout. */
export interface KitLine {
  key: string;
  kind: "KIT";
  productId: string;
  variantId: string;
  name: string;
  code: string;
  image?: string;
  discountPercent: number;
  boxes: KitBox[];
}

export type CartLine = ItemLine | KitLine;

let keySeq = 0;
/** Cart-local id (crypto.randomUUID needs HTTPS, and this needs no randomness). */
const newKey = () => `line-${++keySeq}-${Date.now()}`;

export const lineQuantity = (l: CartLine) => (l.kind === "KIT" ? 1 : l.picks.reduce((s, p) => s + p.quantity, 0));

const boxCount = (b: KitBox) => b.picks.reduce((s, p) => s + p.quantity, 0);
export const boxDone = (b: KitBox) => boxCount(b) >= b.perKit;
export const kitComplete = (l: KitLine) => l.boxes.every(boxDone);

/** How many of a variant at a location are already in the cart (so the space list shows what's left). */
export function inCart(cart: CartLine[], variantId: string, locationId: string): number {
  let n = 0;
  for (const l of cart) {
    const picks = l.kind === "KIT" ? (l.boxes.find((b) => b.variantId === variantId)?.picks ?? []) : l.variantId === variantId ? l.picks : [];
    for (const p of picks) if (p.locationId === locationId) n += p.quantity;
  }
  return n;
}

function addPick(picks: Pick[], pick: Pick): Pick[] {
  const existing = picks.find((p) => p.locationId === pick.locationId);
  return existing
    ? picks.map((p) => (p === existing ? { ...p, quantity: p.quantity + pick.quantity } : p))
    : [...picks, pick];
}

/** Adds one unit of a normal item taken from a space (same item again = same line, more picks). */
export function addItem(cart: CartLine[], item: Omit<ItemLine, "key" | "kind" | "picks" | "discountPercent">, pick: Pick): CartLine[] {
  const existing = cart.find((l): l is ItemLine => l.kind === "STANDARD" && l.variantId === item.variantId);
  if (existing) return cart.map((l) => (l === existing ? { ...existing, picks: addPick(existing.picks, pick) } : l));
  return [...cart, { ...item, key: newKey(), kind: "STANDARD", discountPercent: 0, picks: [pick] }];
}

/** Removes one unit (from the most recently added space). */
export function removeOne(cart: CartLine[], key: string): CartLine[] {
  return cart.flatMap((l) => {
    if (l.key !== key || l.kind !== "STANDARD") return [l];
    const picks = [...l.picks];
    const last = picks[picks.length - 1];
    if (last.quantity > 1) picks[picks.length - 1] = { ...last, quantity: last.quantity - 1 };
    else picks.pop();
    return picks.length ? [{ ...l, picks }] : [];
  });
}

/**
 * Puts a scanned box into the first kit of that product still missing it, or starts a new kit.
 * Scanning the same box again therefore never completes a kit ("A, A, A" makes three kits, each missing B and C).
 */
export function addBox(
  cart: CartLine[],
  kit: Omit<KitLine, "key" | "kind" | "discountPercent">,
  boxVariantId: string,
  pick: Pick,
  targetKey?: string,
): CartLine[] {
  const open = cart.find(
    (l): l is KitLine =>
      l.kind === "KIT" &&
      (targetKey ? l.key === targetKey : l.variantId === kit.variantId && !boxDone(l.boxes.find((b) => b.variantId === boxVariantId)!)),
  );
  const line: KitLine = open ?? { ...kit, key: newKey(), kind: "KIT", discountPercent: 0 };
  const updated: KitLine = {
    ...line,
    boxes: line.boxes.map((b) => (b.variantId === boxVariantId ? { ...b, picks: addPick(b.picks, { ...pick, quantity: 1 }) } : b)),
  };
  return open ? cart.map((l) => (l === open ? updated : l)) : [...cart, updated];
}

export function newKit(cart: CartLine[], kit: Omit<KitLine, "key" | "kind" | "discountPercent">): CartLine[] {
  return [...cart, { ...kit, key: newKey(), kind: "KIT", discountPercent: 0 }];
}

/** What the API needs to sell this cart. */
export function toSaleLines(cart: CartLine[]) {
  return cart.map((l) => ({
    variantId: l.variantId,
    quantity: lineQuantity(l),
    discountPercent: l.discountPercent || undefined,
    picks:
      l.kind === "KIT"
        ? l.boxes.flatMap((b) => b.picks.map((p) => ({ variantId: b.variantId, locationId: p.locationId, quantity: p.quantity })))
        : l.picks.map((p) => ({ variantId: l.variantId, locationId: p.locationId, quantity: p.quantity })),
  }));
}
