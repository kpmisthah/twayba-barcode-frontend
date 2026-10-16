import { api } from "./api";
import type { Location, LocationType, User, VariantKind } from "./types";

/** Mirrors backend/src/stock/reasons.ts. "Other" needs a note. */
export const ADD_REASONS = ["New purchase", "Return", "Found", "Other"] as const;
/** "Damaged" becomes a DAMAGE movement (to the Damaged location); the rest are STOCK_OUT. */
export const REMOVE_REASONS = ["Damaged", "Lost", "Expired", "Manual adjustment", "Other"] as const;

const SYSTEM_TYPES: LocationType[] = ["TRANSIT", "DAMAGED"];

/** Mirrors the API's site limits: admins/managers and users without limits may use every site. */
export function canUseSite(user: Pick<User, "role" | "siteIds"> | null | undefined, siteId: string): boolean {
  if (!user || user.role === "ADMIN" || user.role === "MANAGER" || !user.siteIds?.length) return true;
  return user.siteIds.includes(siteId);
}

/**
 * Where stock can be put: visible, real locations with nothing inside them (normally spaces).
 * Pass `user` to keep only the sites that person may work in.
 */
export function stockableLocations(all: Location[], user?: Pick<User, "role" | "siteIds"> | null): Location[] {
  const hasVisibleChildren = new Set(all.filter((l) => l.active && l.parentId).map((l) => l.parentId));
  return all.filter((l) => l.active && !SYSTEM_TYPES.includes(l.type) && !hasVisibleChildren.has(l.id) && canUseSite(user, l.siteId));
}

/** An item chosen for a stock action: a variant, a kit box, or a whole kit. */
export interface PickedItem {
  productId: string;
  productName: string;
  image?: string;
  variantId: string;
  variantName: string;
  kind: VariantKind;
  code: string;
}

interface ProductLike {
  id: string;
  name: string;
  images: string[];
  variants: { id: string; kind: VariantKind; code: string; name: string; active: boolean }[];
}

/** What can be picked from a product: each active variant, or a whole kit plus its boxes. */
export function pickOptions(product: ProductLike): PickedItem[] {
  return product.variants
    .filter((v) => v.active)
    .sort((a, b) => (a.kind === "KIT" ? -1 : b.kind === "KIT" ? 1 : 0))
    .map((v) => ({
      productId: product.id,
      productName: product.name,
      image: product.images[0],
      variantId: v.id,
      variantName: v.kind === "KIT" ? "Complete kit (all boxes)" : v.name,
      kind: v.kind,
      code: v.code,
    }));
}

interface LookupResult {
  variant: { id: string; kind: VariantKind; code: string; name: string; product: { id: string; name: string; images: string[] } };
}

/** Exact barcode lookup (what a scan does). Throws ApiError 404 for unknown codes. */
export async function lookupCode(code: string): Promise<PickedItem> {
  const { variant: v } = await api<LookupResult>(`/barcodes/lookup/${encodeURIComponent(code.trim())}`);
  return {
    productId: v.product.id,
    productName: v.product.name,
    image: v.product.images[0],
    variantId: v.id,
    variantName: v.name,
    kind: v.kind,
    code: v.code,
  };
}

export function itemLabel(item: PickedItem): string {
  return item.variantName === "Default" ? item.productName : `${item.productName} – ${item.variantName}`;
}
