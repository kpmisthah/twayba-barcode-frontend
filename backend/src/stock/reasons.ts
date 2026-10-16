import { MovementType } from '@prisma/client';

/** Fixed reason lists (spec §6). "Other" needs a note explaining it. */
export const ADD_REASONS = ['New purchase', 'Return', 'Found', 'Other'] as const;
/** "Damaged" is not here: damaged stock is a DAMAGE movement to the Damaged location. */
export const REMOVE_REASONS = ['Lost', 'Expired', 'Manual adjustment', 'Other'] as const;

export const OTHER = 'Other';

/** Returns an error message, or null if the reason/note combination is fine. */
export function reasonError(type: MovementType, reason?: string | null, note?: string | null): string | null {
  const r = reason?.trim();
  const list: readonly string[] | null =
    type === MovementType.STOCK_IN ? ADD_REASONS : type === MovementType.STOCK_OUT ? REMOVE_REASONS : null;

  if (list) {
    if (!r) return 'Choose a reason';
    if (!list.includes(r)) return `Reason must be one of: ${list.join(', ')}`;
  }
  if ((type === MovementType.ADJUSTMENT || type === MovementType.DAMAGE) && !r && !note?.trim()) {
    return type === MovementType.DAMAGE ? 'Describe the damage' : 'Give a reason for the correction';
  }
  if (r === OTHER && !note?.trim()) return 'Add a note explaining "Other"';
  return null;
}
