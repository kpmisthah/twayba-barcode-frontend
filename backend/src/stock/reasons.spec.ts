import { MovementType as M } from '@prisma/client';
import { reasonError } from './reasons.js';

describe('stock reasons', () => {
  it('requires a listed reason to add or remove', () => {
    expect(reasonError(M.STOCK_IN, 'New purchase')).toBeNull();
    expect(reasonError(M.STOCK_IN)).toBe('Choose a reason');
    expect(reasonError(M.STOCK_IN, 'Lost')).toMatch('must be one of');
    expect(reasonError(M.STOCK_OUT, 'Expired')).toBeNull();
  });

  it('needs a note for "Other"', () => {
    expect(reasonError(M.STOCK_OUT, 'Other')).toMatch('note');
    expect(reasonError(M.STOCK_OUT, 'Other', 'Given to a charity')).toBeNull();
  });

  it('needs a description for damage, nothing for a transfer', () => {
    expect(reasonError(M.DAMAGE)).toBe('Describe the damage');
    expect(reasonError(M.DAMAGE, null, 'Scratched top')).toBeNull();
    expect(reasonError(M.TRANSFER)).toBeNull();
  });
});
