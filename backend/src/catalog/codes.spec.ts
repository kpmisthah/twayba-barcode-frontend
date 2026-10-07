import {
  boxLetter,
  componentCode,
  componentName,
  productCode,
  variantCode,
  variantName,
} from './codes.js';

describe('codes', () => {
  it('pads product numbers to six digits', () => {
    expect(productCode(1)).toBe('TW-000001');
    expect(productCode(123456)).toBe('TW-123456');
  });

  it('numbers variants from 01', () => {
    expect(variantCode('TW-000123', 1)).toBe('TW-000123-01');
    expect(variantCode('TW-000123', 12)).toBe('TW-000123-12');
  });

  it('letters boxes A–Z then AA, AB…', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(boxLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA']);
    expect(componentCode('TW-000200', 2)).toBe('TW-000200-C');
  });

  it('builds readable names', () => {
    expect(variantName('Black', 'Large')).toBe('Black / Large');
    expect(variantName(' ', null)).toBe('Default');
    expect(componentName(0, 'Side panels')).toBe('Box A – Side panels');
    expect(componentName(1)).toBe('Box B');
  });
});
