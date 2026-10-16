import type { Order, OrderAllocation } from "./types";

export const allocationName = (a: OrderAllocation) =>
  a.variant.kind === "COMPONENT"
    ? `${a.variant.product.name}, ${a.variant.name.split(" – ")[0]}`
    : a.variant.name !== "Default"
      ? `${a.variant.product.name} – ${a.variant.name}`
      : a.variant.product.name;

/** Units on the van right now, per item (box or variant). */
export function onVan(order: Order): { variantId: string; name: string; code: string; image?: string; quantity: number }[] {
  const map = new Map<string, { variantId: string; name: string; code: string; image?: string; quantity: number }>();
  for (const a of order.allocations) {
    const n = a.picked - a.delivered - a.returned;
    if (n <= 0) continue;
    const row = map.get(a.variantId) ?? { variantId: a.variantId, name: allocationName(a), code: a.variant.code, image: a.variant.product.images[0], quantity: 0 };
    row.quantity += n;
    map.set(a.variantId, row);
  }
  return [...map.values()];
}

/** Google Maps link from the pin, or a search for the address. */
export function directionsUrl(order: Pick<Order, "latitude" | "longitude" | "address">) {
  if (order.latitude !== null && order.longitude !== null) return `https://www.google.com/maps/dir/?api=1&destination=${order.latitude},${order.longitude}`;
  if (order.address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${order.address}, Malta`)}`;
  return null;
}
