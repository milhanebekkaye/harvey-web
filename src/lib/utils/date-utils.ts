/**
 * Date utilities for consistent parsing and display.
 *
 * - toNoonUTC: Parses YYYY-MM-DD as noon UTC to avoid "off by one day"
 *   when displaying in timezones ahead of UTC (new Date("2026-03-01") = UTC midnight).
 * - formatDateForDisplay: Format a date for UI with optional timezone.
 */

/**
 * Converts a YYYY-MM-DD string to a Date at noon UTC.
 * This prevents the "off by one day" bug where new Date("2026-03-01")
 * creates UTC midnight which displays as the previous day in timezones ahead of UTC.
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Date at noon UTC, or invalid Date if input is invalid
 */
export function toNoonUTC(dateStr: string): Date {
  const parts = dateStr.trim().split('-')
  if (parts.length < 3) return new Date(NaN)
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  if ([year, month, day].some((n) => Number.isNaN(n))) return new Date(NaN)
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
}

/**
 * Formats a Date for display in the user's local timezone (or optional IANA timezone).
 * Pass a timezone string (e.g. "Europe/Paris") for consistent display across clients.
 *
 * @param date - Date object or ISO/date string
 * @param timezone - Optional IANA timezone for display
 */
export function formatDateForDisplay(date: Date | string, timezone?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return String(date)
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(d)
}
