/**
 * Parses an ISO date string from the API (e.g. "2026-03-01T00:00:00Z") as a
 * local calendar date, ignoring the time/timezone component.
 *
 * Using `new Date(isoString)` would interpret the UTC midnight as the previous
 * day in negative-offset timezones (e.g. UTC-3 → Feb 28 at 21:00).
 */
export function parseDate(isoString: string): Date {
  const [year, month, day] = isoString.substring(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}
