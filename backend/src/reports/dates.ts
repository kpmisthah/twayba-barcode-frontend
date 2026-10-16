/** Report dates are the shop's days (Malta: UTC+1, UTC+2 in summer), not UTC days. */
export const TIME_ZONE = 'Europe/Malta';

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** The same instant written as Malta wall-clock time, but stored as if it were UTC (for Excel and day keys). */
export function maltaWallClock(date: Date): Date {
  const p = Object.fromEntries(parts.formatToParts(date).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second));
}

/** The instant a Malta day ("2026-10-11") starts. */
export function startOfMaltaDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const offset = maltaWallClock(new Date(guess)).getTime() - guess;
  // Re-check once: the offset at local midnight can differ from the guess on DST change days.
  const first = guess - offset;
  const offset2 = maltaWallClock(new Date(first)).getTime() - first;
  return new Date(guess - offset2);
}

/** [from, to) covering whole Malta days; either end may be open. */
export function dayRange(from?: string, to?: string): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = startOfMaltaDay(from);
  if (to) {
    const [y, m, d] = to.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    range.lt = startOfMaltaDay(next);
  }
  return range;
}

/** "2026-10-11" — the Malta day an instant falls on. */
export function maltaDay(date: Date): string {
  return maltaWallClock(date).toISOString().slice(0, 10);
}
