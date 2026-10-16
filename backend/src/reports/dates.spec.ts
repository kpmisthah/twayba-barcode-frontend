import { dayRange, maltaDay, startOfMaltaDay } from './dates.js';

describe('Malta report days', () => {
  it('starts a summer day at 22:00 UTC the day before (UTC+2)', () => {
    expect(startOfMaltaDay('2026-07-15').toISOString()).toBe('2026-07-14T22:00:00.000Z');
  });

  it('starts a winter day at 23:00 UTC the day before (UTC+1)', () => {
    expect(startOfMaltaDay('2026-12-01').toISOString()).toBe('2026-11-30T23:00:00.000Z');
  });

  it('handles the clock-change days', () => {
    // Clocks go back on 25 Oct 2026 (03:00 → 02:00): that day still starts at UTC+2.
    expect(startOfMaltaDay('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(startOfMaltaDay('2026-10-26').toISOString()).toBe('2026-10-25T23:00:00.000Z');
    // Clocks go forward on 29 Mar 2026.
    expect(startOfMaltaDay('2026-03-29').toISOString()).toBe('2026-03-28T23:00:00.000Z');
  });

  it('builds an inclusive day range [from, to]', () => {
    const r = dayRange('2026-12-01', '2026-12-31');
    expect(r.gte?.toISOString()).toBe('2026-11-30T23:00:00.000Z');
    expect(r.lt?.toISOString()).toBe('2026-12-31T23:00:00.000Z');
    expect(dayRange()).toEqual({});
  });

  it('puts a late-evening UTC sale on the next Malta day', () => {
    expect(maltaDay(new Date('2026-07-14T22:30:00Z'))).toBe('2026-07-15');
    expect(maltaDay(new Date('2026-07-14T21:30:00Z'))).toBe('2026-07-14');
  });
});
