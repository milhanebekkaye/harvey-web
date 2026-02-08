/**
 * Timezone utilities for consistent storage (UTC) and display (user's timezone).
 *
 * Convention:
 * - Database stores scheduledDate, scheduledStartTime, scheduledEndTime as UTC.
 * - User intent (e.g. "6pm to 8pm") is in their timezone; we convert to UTC when saving.
 * - When displaying, we convert UTC back to the user's timezone so they see 6pm–8pm.
 */

/**
 * Get the timezone offset in minutes for a given date.
 * Positive = timezone is ahead of UTC (e.g. Europe/Paris winter = +60).
 * So: UTC = local - offsetMinutes.
 *
 * @param timeZone - IANA timezone (e.g. "Europe/Paris")
 * @param date - Reference date (for DST)
 */
export function getTimezoneOffsetMinutes(timeZone: string, date: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  })
  const parts = formatter.formatToParts(date)
  const tzPart = parts.find((p) => p.type === 'timeZoneName')
  const value = tzPart?.value ?? 'GMT+0'
  const match = value.match(/GMT([+-])(\d+)/)
  if (!match) return 0
  const sign = match[1] === '+' ? 1 : -1
  const hours = parseInt(match[2], 10)
  return sign * hours * 60
}

/**
 * Create a UTC Date from a local date + time in a specific timezone.
 * Used when the user says "tomorrow 6pm" (in their timezone) and we need to store UTC.
 *
 * @param dateStr - Date only YYYY-MM-DD
 * @param hour - Hour in user's local time (0–23)
 * @param minute - Minute (0–59)
 * @param timeZone - User's IANA timezone
 */
export function localTimeInTimezoneToUTC(
  dateStr: string,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return new Date(NaN)
  // Probe at noon UTC that day to get DST offset for that date
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const offsetMinutes = getTimezoneOffsetMinutes(timeZone, probe)
  const localMinutes = hour * 60 + minute
  const utcMinutes = localMinutes - offsetMinutes
  let utcDay = Math.floor(utcMinutes / (24 * 60))
  const remainder = ((utcMinutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const uh = Math.floor(remainder / 60)
  const um = remainder % 60
  return new Date(Date.UTC(y, m - 1, d + utcDay, uh, um, 0, 0))
}

/**
 * Get hour as decimal (0–24) from a UTC Date when displayed in a given timezone.
 * Used for UI: DB has UTC, we show times in user's local time.
 *
 * @param date - UTC date from database
 * @param timeZone - User's IANA timezone
 */
export function getHourDecimalInTimezone(date: Date | string, timeZone: string): number {
  const d = typeof date === 'string' ? new Date(date) : date
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(d)
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
  return hour + minute / 60
}

/**
 * Format a UTC date as time string (HH:MM) in the user's timezone.
 */
export function formatTimeInTimezone(
  date: Date | string,
  timeZone: string,
  options: { hour12?: boolean } = {}
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: options.hour12 ?? false,
    timeZone,
  })
}

/**
 * Get YYYY-MM-DD for a UTC Date when interpreted in a timezone.
 * Used for "today" comparison and grouping task dates in user's local date.
 *
 * @param utcDate - UTC date (e.g. from database)
 * @param timeZone - IANA timezone (e.g. "Europe/Paris")
 */
export function getDateStringInTimezone(utcDate: Date, timeZone: string): string {
  return utcDate.toLocaleDateString('en-CA', { timeZone })
}

/**
 * Format a UTC date as a long date string in user's timezone for prompts.
 * e.g. "Monday, February 9th, 2026"
 *
 * @param utcDate - UTC date (e.g. from database)
 * @param timeZone - IANA timezone (e.g. "Europe/Paris")
 */
export function formatDateLongInTimezone(utcDate: Date, timeZone: string): string {
  return utcDate.toLocaleDateString('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
