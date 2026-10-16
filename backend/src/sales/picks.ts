export interface LineToCheck {
  name: string;
  kind: 'STANDARD' | 'KIT';
  variantId: string;
  quantity: number;
  /** For a kit: its boxes and how many of each one kit needs. */
  boxes: { variantId: string; name: string; perKit: number }[];
}

/**
 * Checks that the stock taken matches what is sold. A kit needs exactly
 * quantity × per-kit of every box — "A, A, A" never completes an A + B + C kit.
 * Returns an error message, or null when it adds up.
 */
export function pickProblem(line: LineToCheck, picks: { variantId: string; quantity: number }[]): string | null {
  const taken = new Map<string, number>();
  for (const p of picks) taken.set(p.variantId, (taken.get(p.variantId) ?? 0) + p.quantity);

  if (line.kind === 'STANDARD') {
    if ([...taken.keys()].some((id) => id !== line.variantId)) return `${line.name}: a different item was picked`;
    const total = taken.get(line.variantId) ?? 0;
    return total === line.quantity ? null : `${line.name}: ${line.quantity} sold but ${total} taken from spaces`;
  }

  const boxIds = new Set(line.boxes.map((b) => b.variantId));
  if ([...taken.keys()].some((id) => !boxIds.has(id))) return `${line.name}: a scanned box is not part of this kit`;
  // Missing boxes first: that's what the cashier needs to go and find.
  for (const box of line.boxes) {
    const needed = box.perKit * line.quantity;
    const got = taken.get(box.variantId) ?? 0;
    if (got < needed) return `${line.name}: ${box.name} missing (${got} of ${needed} scanned)`;
  }
  for (const box of line.boxes) {
    const needed = box.perKit * line.quantity;
    const got = taken.get(box.variantId) ?? 0;
    if (got > needed) return `${line.name}: too many of ${box.name} (${got} scanned, kit needs ${needed})`;
  }
  return null;
}
