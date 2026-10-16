import { kitAvailability } from './kit-math.js';

describe('kit availability', () => {
  it('matches the spec example: 10 A, 10 B, 7 C → 7 kits, 3 A and 3 B spare', () => {
    const result = kitAvailability([
      { variantId: 'A', perKit: 1, available: 10 },
      { variantId: 'B', perKit: 1, available: 10 },
      { variantId: 'C', perKit: 1, available: 7 },
    ]);
    expect(result.sellable).toBe(7);
    expect(result.boxes.map((b) => b.spare)).toEqual([3, 3, 0]);
  });

  it('respects quantities per kit (2 × A + 1 × B)', () => {
    const result = kitAvailability([
      { variantId: 'A', perKit: 2, available: 5 },
      { variantId: 'B', perKit: 1, available: 4 },
    ]);
    expect(result.sellable).toBe(2);
    expect(result.boxes.map((b) => b.spare)).toEqual([1, 2]);
  });

  it('is zero when a box is missing or there are no boxes', () => {
    expect(kitAvailability([{ variantId: 'A', perKit: 1, available: 0 }]).sellable).toBe(0);
    expect(kitAvailability([]).sellable).toBe(0);
  });
});
