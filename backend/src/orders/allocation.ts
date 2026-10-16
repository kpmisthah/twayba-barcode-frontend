/** What a line needs reserved: the variant itself, or each box of a kit (quantity × per kit). */
export interface Need {
  lineId: string;
  variantId: string;
  quantity: number;
}

/** Free stock at one location. */
export interface Source {
  variantId: string;
  locationId: string;
  site: string;
  path: string;
  available: number;
}

export interface Allocation {
  lineId: string;
  variantId: string;
  locationId: string;
  quantity: number;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * Suggests where to take each item from. Sites that can cover more of the order come first,
 * so drivers visit as few sites as possible; within a site, the fullest spaces first.
 */
export function suggestAllocation(needs: Need[], sources: Source[]): { allocations: Allocation[]; short: (Need & { missing: number })[] } {
  const left = new Map(sources.map((s) => [`${s.variantId}:${s.locationId}`, s.available]));

  // How much of the order each site could supply.
  const wanted = new Map<string, number>();
  for (const n of needs) wanted.set(n.variantId, (wanted.get(n.variantId) ?? 0) + n.quantity);
  const siteCover = new Map<string, number>();
  const perSiteVariant = new Map<string, number>();
  for (const s of sources) perSiteVariant.set(`${s.site}:${s.variantId}`, (perSiteVariant.get(`${s.site}:${s.variantId}`) ?? 0) + s.available);
  for (const [key, available] of perSiteVariant) {
    const [site, variantId] = [key.slice(0, key.lastIndexOf(':')), key.slice(key.lastIndexOf(':') + 1)];
    siteCover.set(site, (siteCover.get(site) ?? 0) + Math.min(available, wanted.get(variantId) ?? 0));
  }
  const siteRank = (site: string) => -(siteCover.get(site) ?? 0);

  const allocations: Allocation[] = [];
  const short: (Need & { missing: number })[] = [];
  for (const need of needs) {
    let remaining = need.quantity;
    const candidates = sources
      .filter((s) => s.variantId === need.variantId)
      .sort((a, b) => siteRank(a.site) - siteRank(b.site) || collator.compare(a.site, b.site) || b.available - a.available || collator.compare(a.path, b.path));
    for (const s of candidates) {
      if (remaining === 0) break;
      const key = `${s.variantId}:${s.locationId}`;
      const take = Math.min(remaining, left.get(key) ?? 0);
      if (take <= 0) continue;
      left.set(key, (left.get(key) ?? 0) - take);
      allocations.push({ lineId: need.lineId, variantId: need.variantId, locationId: s.locationId, quantity: take });
      remaining -= take;
    }
    if (remaining > 0) short.push({ ...need, missing: remaining });
  }
  return { allocations, short };
}

/** Checks a confirmed allocation covers every need exactly. Returns an error message or null. */
export function allocationProblem(needs: (Need & { name: string })[], allocations: Allocation[]): string | null {
  const got = new Map<string, number>();
  for (const a of allocations) {
    if (!Number.isInteger(a.quantity) || a.quantity <= 0) return 'Each allocation needs a quantity above 0';
    const key = `${a.lineId}:${a.variantId}`;
    got.set(key, (got.get(key) ?? 0) + a.quantity);
  }
  const needed = new Set(needs.map((n) => `${n.lineId}:${n.variantId}`));
  if ([...got.keys()].some((k) => !needed.has(k))) return 'An allocation is for an item that is not on the order';
  for (const n of needs) {
    const have = got.get(`${n.lineId}:${n.variantId}`) ?? 0;
    if (have !== n.quantity) return `${n.name}: ${have} allocated but ${n.quantity} needed`;
  }
  return null;
}
