import { LocationType as L, MovementType as M } from '@prisma/client';
import { assertShape, effectsOf, isValidLevel, systemLocationError } from './movement-rules.js';

describe('movement rules', () => {
  it('requires the right locations per type', () => {
    expect(() => assertShape({ type: M.STOCK_IN, quantity: 1, toLocationId: 'a' })).not.toThrow();
    expect(() => assertShape({ type: M.STOCK_IN, quantity: 1 })).toThrow('needs a "to" location');
    expect(() => assertShape({ type: M.STOCK_OUT, quantity: 1, fromLocationId: 'a', toLocationId: 'b' })).toThrow(
      `can't have a "to" location`,
    );
    expect(() => assertShape({ type: M.TRANSFER, quantity: 1, fromLocationId: 'a', toLocationId: 'a' })).toThrow('same location');
  });

  it('takes exactly one side for an adjustment', () => {
    expect(() => assertShape({ type: M.ADJUSTMENT, quantity: 1, fromLocationId: 'a' })).not.toThrow();
    expect(() => assertShape({ type: M.ADJUSTMENT, quantity: 1 })).toThrow('either in');
    expect(() => assertShape({ type: M.ADJUSTMENT, quantity: 1, fromLocationId: 'a', toLocationId: 'b' })).toThrow('either in');
  });

  it('rejects zero, negative and fractional quantities', () => {
    for (const quantity of [0, -1, 1.5]) {
      expect(() => assertShape({ type: M.STOCK_IN, quantity, toLocationId: 'a' })).toThrow('whole number');
    }
  });

  it('computes stock effects', () => {
    expect(effectsOf({ type: M.TRANSFER, quantity: 2, fromLocationId: 'a', toLocationId: 'b' })).toEqual([
      { locationId: 'a', onHand: -2, reserved: 0 },
      { locationId: 'b', onHand: 2, reserved: 0 },
    ]);
    expect(effectsOf({ type: M.RESERVE, quantity: 3, fromLocationId: 'a' })).toEqual([{ locationId: 'a', onHand: 0, reserved: 3 }]);
    // Loading uses up the reservation.
    expect(effectsOf({ type: M.LOAD, quantity: 1, fromLocationId: 'a', toLocationId: 't' })).toEqual([
      { locationId: 'a', onHand: -1, reserved: -1 },
      { locationId: 't', onHand: 1, reserved: 0 },
    ]);
    expect(effectsOf({ type: M.ADJUSTMENT, quantity: 4, toLocationId: 'a' })).toEqual([{ locationId: 'a', onHand: 4, reserved: 0 }]);
  });

  it('keeps reserved within on-hand', () => {
    expect(isValidLevel({ onHand: 2, reserved: 2 })).toBe(true);
    expect(isValidLevel({ onHand: -1, reserved: 0 })).toBe(false);
    expect(isValidLevel({ onHand: 1, reserved: 2 })).toBe(false);
  });

  it('keeps In Transit for loading, delivering and returning only', () => {
    expect(systemLocationError(M.LOAD, L.SPACE, L.TRANSIT)).toBeNull();
    expect(systemLocationError(M.DELIVER, L.TRANSIT)).toBeNull();
    expect(systemLocationError(M.RETURN, L.TRANSIT, L.SPACE)).toBeNull();
    expect(systemLocationError(M.TRANSFER, L.SPACE, L.TRANSIT)).toMatch('only by loading');
    expect(systemLocationError(M.LOAD, L.SPACE, L.ROOM)).toMatch('must go to In Transit');
    expect(systemLocationError(M.DELIVER, L.SPACE)).toMatch('Only stock In Transit');
    expect(systemLocationError(M.STOCK_OUT, L.TRANSIT)).toMatch('leaves In Transit only');
  });

  it('lets two-step transfers use In Transit, and nothing else sneak in or out', () => {
    expect(systemLocationError(M.TRANSFER_OUT, L.SPACE, L.TRANSIT)).toBeNull();
    expect(systemLocationError(M.TRANSFER_IN, L.TRANSIT, L.SPACE)).toBeNull();
    expect(systemLocationError(M.TRANSFER_OUT, L.SPACE, L.ROOM)).toMatch('must go to In Transit');
    expect(systemLocationError(M.TRANSFER_IN, L.SPACE, L.ROOM)).toMatch('received from In Transit');
    expect(systemLocationError(M.ADJUSTMENT, L.TRANSIT)).toBeNull(); // writing off a lost transfer
    expect(systemLocationError(M.TRANSFER, L.TRANSIT, L.SPACE)).toMatch('leaves In Transit only');
  });

  it('keeps Damaged for damage and its clean-up', () => {
    expect(systemLocationError(M.DAMAGE, L.SPACE, L.DAMAGED)).toBeNull();
    expect(systemLocationError(M.STOCK_OUT, L.DAMAGED)).toBeNull();
    expect(systemLocationError(M.DAMAGE, L.SPACE, L.ROOM)).toMatch('must go to the Damaged');
    expect(systemLocationError(M.TRANSFER, L.SPACE, L.DAMAGED)).toMatch('Mark damaged');
    expect(systemLocationError(M.SALE, L.DAMAGED)).toMatch('only be removed');
    expect(systemLocationError(M.TRANSFER, L.SPACE, L.ROOM)).toBeNull();
  });
});
