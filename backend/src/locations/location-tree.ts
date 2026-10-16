import { LocationType } from '@prisma/client';

/** What may be created directly under each type. `ROOT` = no parent. */
export const CHILD_TYPES: Record<LocationType | 'ROOT', readonly LocationType[]> = {
  ROOT: [LocationType.SITE],
  SITE: [LocationType.FLOOR, LocationType.ROOM],
  FLOOR: [LocationType.ROOM],
  ROOM: [LocationType.SHELF],
  SHELF: [LocationType.SPACE],
  SPACE: [],
  TRANSIT: [],
  DAMAGED: [],
};

export const SYSTEM_TYPES: readonly LocationType[] = [LocationType.TRANSIT, LocationType.DAMAGED];

export const PATH_SEPARATOR = ' › ';

export interface TreeNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

/** Names from the site down to each location: id → ["Hamrun Shop", "Top", "Room 1"]. */
export function buildPaths<T extends TreeNode>(nodes: T[]): Map<string, string[]> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const paths = new Map<string, string[]>();

  const pathOf = (node: T, seen = new Set<string>()): string[] => {
    const cached = paths.get(node.id);
    if (cached) return cached;
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    // A cycle can't be created through the API, but never loop forever on bad data.
    const prefix = parent && !seen.has(parent.id) ? pathOf(parent, seen.add(node.id)) : [];
    const path = [...prefix, node.name];
    paths.set(node.id, path);
    return path;
  };

  for (const node of nodes) pathOf(node);
  return paths;
}

/** The given ids plus everything below them, parents before children. */
export function withDescendants<T extends TreeNode>(nodes: T[], rootIds: string[]): T[] {
  const children = new Map<string | null, T[]>();
  for (const n of nodes) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const out: T[] = [];
  const seen = new Set<string>();
  const visit = (node: T) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    out.push(node);
    for (const child of sortSiblings(children.get(node.id) ?? [])) visit(child);
  };
  for (const id of rootIds) {
    const node = byId.get(id);
    if (node) visit(node);
  }
  return out;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** sortOrder first, then natural name order so A2 comes before A10. */
export function sortSiblings<T extends TreeNode>(nodes: T[]): T[] {
  return [...nodes].sort((a, b) => a.sortOrder - b.sortOrder || collator.compare(a.name, b.name));
}

/**
 * The nearest ancestors that fit in `maxChars`, for small labels:
 * ["Hamrun Shop", "Top", "Room 1", "Shelf A"] → "Room 1 › Shelf A".
 */
export function shortPath(ancestors: string[], maxChars: number): string {
  let out = '';
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const next = out ? `${ancestors[i]}${PATH_SEPARATOR}${out}` : ancestors[i];
    if (out && next.length > maxChars) break;
    out = next;
  }
  return out;
}
