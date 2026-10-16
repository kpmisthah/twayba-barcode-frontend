import { LocationType, MovementType } from '@prisma/client';

type Need = 'required' | 'optional' | 'forbidden';

/** Which locations each movement type takes. ADJUSTMENT takes exactly one (in or out). */
const SHAPE: Record<MovementType, { from: Need; to: Need }> = {
  STOCK_IN: { from: 'forbidden', to: 'required' },
  STOCK_OUT: { from: 'required', to: 'forbidden' },
  TRANSFER: { from: 'required', to: 'required' },
  ADJUSTMENT: { from: 'optional', to: 'optional' },
  RESERVE: { from: 'required', to: 'forbidden' },
  RELEASE: { from: 'required', to: 'forbidden' },
  LOAD: { from: 'required', to: 'required' },
  DELIVER: { from: 'required', to: 'forbidden' },
  RETURN: { from: 'optional', to: 'required' },
  SALE: { from: 'required', to: 'forbidden' },
  SALE_RETURN: { from: 'forbidden', to: 'required' },
  DAMAGE: { from: 'required', to: 'required' },
  TRANSFER_OUT: { from: 'required', to: 'required' },
  TRANSFER_IN: { from: 'required', to: 'required' },
};

export interface MovementShape {
  type: MovementType;
  quantity: number;
  fromLocationId?: string | null;
  toLocationId?: string | null;
}

/** Change to one stock row. */
export interface Effect {
  locationId: string;
  onHand: number;
  reserved: number;
}

/** Throws a readable message if the movement is malformed. */
export function assertShape(m: MovementShape): void {
  if (!Number.isInteger(m.quantity) || m.quantity <= 0) throw new Error('Quantity must be a whole number above 0');
  const shape = SHAPE[m.type];
  const check = (need: Need, value: string | null | undefined, side: string) => {
    if (need === 'required' && !value) throw new Error(`${label(m.type)} needs a "${side}" location`);
    if (need === 'forbidden' && value) throw new Error(`${label(m.type)} can't have a "${side}" location`);
  };
  check(shape.from, m.fromLocationId, 'from');
  check(shape.to, m.toLocationId, 'to');
  if (m.type === MovementType.ADJUSTMENT && !m.fromLocationId === !m.toLocationId) {
    throw new Error('An adjustment is either in (to a location) or out (from a location)');
  }
  if (m.fromLocationId && m.fromLocationId === m.toLocationId) throw new Error('"From" and "to" are the same location');
}

/** What the movement does to stock rows. LOAD uses up the reservation it was made against. */
export function effectsOf(m: MovementShape): Effect[] {
  const q = m.quantity;
  const out: Effect[] = [];
  const from = m.fromLocationId;
  const to = m.toLocationId;

  switch (m.type) {
    case MovementType.RESERVE:
      return [{ locationId: from!, onHand: 0, reserved: q }];
    case MovementType.RELEASE:
      return [{ locationId: from!, onHand: 0, reserved: -q }];
    case MovementType.LOAD:
      out.push({ locationId: from!, onHand: -q, reserved: -q });
      break;
    default:
      if (from) out.push({ locationId: from, onHand: -q, reserved: 0 });
  }
  if (to) out.push({ locationId: to, onHand: q, reserved: 0 });
  return out;
}

/**
 * System locations only take part in their own steps:
 * In Transit is entered by LOAD (orders) or TRANSFER_OUT (two-step transfers), and left by
 * DELIVER / RETURN / TRANSFER_IN — or an ADJUSTMENT writing off a transfer that never arrived;
 * Damaged is entered by DAMAGE or a damaged return, and can be cleared out or corrected.
 * Returns an error message, or null if allowed.
 */
export function systemLocationError(type: MovementType, fromType?: LocationType, toType?: LocationType): string | null {
  const T = MovementType;
  const transitIn: MovementType[] = [T.LOAD, T.TRANSFER_OUT];
  const transitOut: MovementType[] = [T.DELIVER, T.RETURN, T.TRANSFER_IN, T.ADJUSTMENT];
  if (type === T.TRANSFER_IN && fromType !== LocationType.TRANSIT) return 'A transfer is received from In Transit';
  const damagedIn: MovementType[] = [T.DAMAGE, T.RETURN, T.SALE_RETURN, T.ADJUSTMENT];
  const damagedOut: MovementType[] = [T.STOCK_OUT, T.TRANSFER, T.ADJUSTMENT];

  if ((toType === LocationType.TRANSIT) !== transitIn.includes(type)) {
    return toType === LocationType.TRANSIT
      ? 'Stock goes into In Transit only by loading an order'
      : `${label(type)} must go to In Transit`;
  }
  if (type === T.DELIVER && fromType !== LocationType.TRANSIT) return 'Only stock In Transit can be delivered';
  if (fromType === LocationType.TRANSIT && !transitOut.includes(type)) {
    return 'Stock leaves In Transit only by delivering, returning or receiving it';
  }
  if (type === T.DAMAGE && toType !== LocationType.DAMAGED) return 'Damaged stock must go to the Damaged location';
  if (toType === LocationType.DAMAGED && !damagedIn.includes(type)) return 'Use "Mark damaged" to move stock to Damaged';
  if (fromType === LocationType.DAMAGED && !damagedOut.includes(type)) {
    return 'Damaged stock can only be removed, moved or corrected';
  }
  return null;
}

/** Stock rows must stay 0 ≤ reserved ≤ onHand. */
export function isValidLevel(level: { onHand: number; reserved: number }): boolean {
  return level.onHand >= 0 && level.reserved >= 0 && level.reserved <= level.onHand;
}

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  STOCK_IN: 'Stock in',
  STOCK_OUT: 'Stock out',
  TRANSFER: 'Transfer',
  ADJUSTMENT: 'Adjustment',
  RESERVE: 'Reserve',
  RELEASE: 'Release',
  LOAD: 'Load',
  DELIVER: 'Deliver',
  RETURN: 'Return',
  SALE: 'Sale',
  SALE_RETURN: 'Sale return',
  DAMAGE: 'Damage',
  TRANSFER_OUT: 'Sent (transfer)',
  TRANSFER_IN: 'Received (transfer)',
};

function label(type: MovementType) {
  return MOVEMENT_LABELS[type];
}
