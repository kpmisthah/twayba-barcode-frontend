import { pickProblem, type LineToCheck } from './picks.js';

const kit: LineToCheck = {
  name: 'Shelf unit',
  kind: 'KIT',
  variantId: 'kit',
  quantity: 1,
  boxes: [
    { variantId: 'A', name: 'Box A', perKit: 1 },
    { variantId: 'B', name: 'Box B', perKit: 1 },
    { variantId: 'C', name: 'Box C', perKit: 1 },
  ],
};

describe('sale picks', () => {
  it('A + B + C completes one kit', () => {
    expect(pickProblem(kit, [{ variantId: 'A', quantity: 1 }, { variantId: 'B', quantity: 1 }, { variantId: 'C', quantity: 1 }])).toBeNull();
  });

  it('A + A + A is rejected (spec acceptance test)', () => {
    expect(pickProblem(kit, [{ variantId: 'A', quantity: 3 }])).toMatch('Box B missing');
    expect(pickProblem(kit, [{ variantId: 'A', quantity: 2 }, { variantId: 'B', quantity: 1 }, { variantId: 'C', quantity: 1 }])).toMatch(
      'too many of Box A',
    );
  });

  it('respects quantity per kit and number of kits', () => {
    const twoA = { ...kit, quantity: 2, boxes: [{ variantId: 'A', name: 'Box A', perKit: 2 }, { variantId: 'B', name: 'Box B', perKit: 1 }] };
    expect(pickProblem(twoA, [{ variantId: 'A', quantity: 4 }, { variantId: 'B', quantity: 2 }])).toBeNull();
    expect(pickProblem(twoA, [{ variantId: 'A', quantity: 3 }, { variantId: 'B', quantity: 2 }])).toMatch('3 of 4');
  });

  it('rejects a box from another kit', () => {
    expect(pickProblem(kit, [{ variantId: 'Z', quantity: 1 }])).toMatch('not part of this kit');
  });

  it('a normal item can be split across spaces but must add up', () => {
    const chair: LineToCheck = { name: 'Chair', kind: 'STANDARD', variantId: 'c', quantity: 3, boxes: [] };
    expect(pickProblem(chair, [{ variantId: 'c', quantity: 2 }, { variantId: 'c', quantity: 1 }])).toBeNull();
    expect(pickProblem(chair, [{ variantId: 'c', quantity: 2 }])).toMatch('3 sold but 2 taken');
    expect(pickProblem(chair, [{ variantId: 'x', quantity: 3 }])).toMatch('different item');
  });
});
