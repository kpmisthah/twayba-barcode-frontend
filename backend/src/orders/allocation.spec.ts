import { allocationProblem, suggestAllocation, type Source } from './allocation.js';

const src = (variantId: string, site: string, space: string, available: number): Source => ({
  variantId,
  locationId: `${site}/${space}`,
  site,
  path: `${site} › ${space}`,
  available,
});

describe('allocation suggestion', () => {
  it('prefers one site that has everything over spreading across sites', () => {
    const { allocations, short } = suggestAllocation(
      [
        { lineId: 'l1', variantId: 'chair', quantity: 2 },
        { lineId: 'l2', variantId: 'table', quantity: 1 },
      ],
      [src('chair', 'Hamrun', 'A1', 5), src('chair', 'Naxxar', 'B1', 10), src('table', 'Naxxar', 'B2', 1)],
    );
    expect(short).toEqual([]);
    expect(allocations.every((a) => a.locationId.startsWith('Naxxar'))).toBe(true);
  });

  it('spills over to the next space or site when one is not enough', () => {
    const { allocations } = suggestAllocation([{ lineId: 'l1', variantId: 'chair', quantity: 7 }], [src('chair', 'Naxxar', 'B1', 4), src('chair', 'Naxxar', 'B2', 2), src('chair', 'Hamrun', 'A1', 5)]);
    expect(allocations.map((a) => `${a.locationId}=${a.quantity}`)).toEqual(['Naxxar/B1=4', 'Naxxar/B2=2', 'Hamrun/A1=1']);
  });

  it('reports what is short', () => {
    const { short } = suggestAllocation([{ lineId: 'l1', variantId: 'chair', quantity: 3 }], [src('chair', 'Naxxar', 'B1', 1)]);
    expect(short).toEqual([{ lineId: 'l1', variantId: 'chair', quantity: 3, missing: 2 }]);
  });

  it('never gives the same unit to two lines (two kits sharing a box)', () => {
    const { allocations, short } = suggestAllocation(
      [
        { lineId: 'kit1', variantId: 'boxA', quantity: 1 },
        { lineId: 'kit2', variantId: 'boxA', quantity: 1 },
      ],
      [src('boxA', 'Naxxar', 'B1', 1)],
    );
    expect(allocations).toHaveLength(1);
    expect(short).toEqual([{ lineId: 'kit2', variantId: 'boxA', quantity: 1, missing: 1 }]);
  });
});

describe('allocation check', () => {
  const needs = [
    { lineId: 'l1', variantId: 'boxA', quantity: 2, name: 'Box A' },
    { lineId: 'l1', variantId: 'boxB', quantity: 1, name: 'Box B' },
  ];
  it('accepts an exact allocation, split across spaces', () => {
    expect(
      allocationProblem(needs, [
        { lineId: 'l1', variantId: 'boxA', locationId: 'x', quantity: 1 },
        { lineId: 'l1', variantId: 'boxA', locationId: 'y', quantity: 1 },
        { lineId: 'l1', variantId: 'boxB', locationId: 'x', quantity: 1 },
      ]),
    ).toBeNull();
  });
  it('rejects missing, extra or foreign items', () => {
    expect(allocationProblem(needs, [{ lineId: 'l1', variantId: 'boxA', locationId: 'x', quantity: 2 }])).toMatch('Box B: 0 allocated but 1 needed');
    expect(
      allocationProblem(needs, [
        { lineId: 'l1', variantId: 'boxA', locationId: 'x', quantity: 3 },
        { lineId: 'l1', variantId: 'boxB', locationId: 'x', quantity: 1 },
      ]),
    ).toMatch('3 allocated but 2');
    expect(allocationProblem(needs, [{ lineId: 'l1', variantId: 'boxZ', locationId: 'x', quantity: 1 }])).toMatch('not on the order');
  });
});
