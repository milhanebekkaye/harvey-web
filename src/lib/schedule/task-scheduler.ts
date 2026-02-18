/**
 * Task Scheduler
 *
 * Assigns generated tasks to specific dates and time slots based on
 * user's available time constraints.
 *
 * Ported and adapted from Telegram bot's assign_tasks_to_schedule() function.
 *
 * Algorithm:
 * 1. Build availability map from constraints (day → time slots)
 * 2. Sort tasks by dependency order only (topological sort). We do NOT re-sort by priority so dependencies are never broken.
 * 3. For each day in schedule period:
 *    - Get available slots for that day of week
 *    - For each slot, try to fit tasks by duration
 *    - If task doesn't fit, split it (min 1 hour chunks)
 *    - Track remaining hours for split tasks
 * 4. Return scheduled tasks with dates/times
 */

import type {
  CommuteShape,
  ExtractedConstraints,
  ParsedTask,
  TimeBlock,
  WorkScheduleShape,
} from '../../types/api.types'
import { localTimeInTimezoneToUTC } from '../timezone'

/** User life constraints: work schedule and commute. Blocked time is derived from these on-the-fly. */
export interface UserBlockedInput {
  workSchedule?: WorkScheduleShape | null
  commute?: CommuteShape | null
}

/** Session 4: optional context for smart slot assignment. */
export interface SchedulerOptions {
  energyPeak?: string | null
  preferredSessionLength?: number | null
  userNotes?: Array<{ note: string }> | null
  projectNotes?: Array<{ note: string }> | null
  phases?: { phases: Array<{ deadline?: string | null }>; active_phase_id: number } | null
  /** When true, day 1 gets max 2 tasks and prefer medium/low energy. */
  rampUpDay1?: boolean
}

// ============================================
// Types
// ============================================

/**
 * A task that has been assigned to a specific date and time (or to a flexible window).
 */
export interface ScheduledTaskAssignment {
  /**
   * Index of the original task in the tasks array
   */
  taskIndex: number

  /**
   * Original task data
   */
  task: ParsedTask

  /**
   * Scheduled date (midnight of that day)
   */
  date: Date

  /**
   * Start time as full datetime (used for ordering; persisted as null when isFlexible)
   */
  startTime: Date

  /**
   * End time as full datetime (used for ordering; persisted as null when isFlexible)
   */
  endTime: Date

  /**
   * Time block string for display: "09:00-11:00" or boundary for flexible
   */
  timeBlock: string

  /**
   * If this is a split task, which part number (1, 2, 3...)
   * undefined if task wasn't split
   */
  partNumber?: number

  /**
   * Hours assigned to this slot (for split tasks)
   */
  hoursAssigned: number

  /**
   * True when task is assigned to a flexible window (no fixed time; use windowStart/windowEnd).
   */
  isFlexible?: boolean

  /**
   * Boundary start for flexible tasks (e.g. '09:00').
   */
  windowStart?: string

  /**
   * Boundary end for flexible tasks (e.g. '17:30').
   */
  windowEnd?: string

  /**
   * Slot type this assignment was placed in (Session 2: for coaching message stats).
   */
  slotType?: SlotType
}

/**
 * Result of the scheduling algorithm
 */
export interface ScheduleResult {
  /**
   * Tasks that were successfully scheduled
   */
  scheduledTasks: ScheduledTaskAssignment[]

  /**
   * Indices of tasks that couldn't be scheduled (not enough available time)
   */
  unscheduledTaskIndices: number[]

  /**
   * Total hours that were scheduled
   */
  totalHoursScheduled: number

  /**
   * Total hours that couldn't be scheduled
   */
  totalHoursUnscheduled: number

  /** Session 2: weekend hours used (saturday + sunday) for coaching message */
  weekendHoursUsed?: number
  /** Session 2: weekend hours available for coaching message */
  weekendHoursAvailable?: number
}

/**
 * Slot type for smart scheduling (Session 4).
 * peak_energy = user's best time; normal = standard; flexible = anywhere; emergency = use only when capacity exhausted.
 */
export type SlotType = 'peak_energy' | 'normal' | 'flexible' | 'emergency'

/**
 * Internal representation of an available time slot.
 * When flexibleHours is set, slot capacity = flexibleHours (boundary in windowStart/windowEnd).
 * slotType is set from energy_peak and window type for smart task placement.
 */
interface TimeSlot {
  day: string // monday, tuesday, etc.
  startHours: number // decimal hours (9.5 = 9:30 AM)
  endHours: number // decimal hours
  label?: string
  flexibleHours?: number // when set, capacity = this; task gets is_flexible and window bounds
  windowStart?: string // boundary start e.g. '09:00'
  windowEnd?: string // boundary end e.g. '17:30'
  slotType?: SlotType // Session 4: for matching task.preferred_slot
}

/**
 * Remaining task to be scheduled
 */
interface RemainingTask {
  taskIndex: number
  task: ParsedTask
  remainingHours: number
  partNumber: number
}

// ============================================
// Helper Functions
// ============================================

/**
 * Parse time string "HH:MM" to decimal hours
 *
 * @param timeStr - Time string in 24-hour format (e.g., "09:30")
 * @returns Decimal hours (e.g., 9.5)
 */
export function parseTimeToHours(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours + minutes / 60
}

/**
 * Format decimal hours to time string
 *
 * @param hours - Decimal hours (e.g., 9.5)
 * @returns Time string in 24-hour format (e.g., "09:30")
 */
export function formatHoursToTime(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours % 1) * 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

/**
 * Get day name from date (lowercase)
 *
 * @param date - Date object
 * @returns Day name (e.g., "monday", "tuesday")
 */
export function getDayName(date: Date): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return days[date.getDay()]
}

/**
 * Get the next Monday from a date
 * If date is Monday, returns next Monday (7 days later)
 *
 * @param fromDate - Starting date
 * @returns Date of next Monday
 */
export function getNextMonday(fromDate: Date): Date {
  const date = new Date(fromDate)
  const dayOfWeek = date.getDay()
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek // Sunday: 1, Mon-Sat: 8-dayOfWeek
  date.setDate(date.getDate() + daysUntilMonday)
  date.setHours(0, 0, 0, 0)
  return date
}

/**
 * Add days to a date
 *
 * @param date - Starting date
 * @param days - Number of days to add
 * @returns New date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Create a full datetime from a date and decimal hours (legacy, uses server local time).
 * Prefer createDateTimeInTimezone for timezone-aware scheduling.
 */
function createDateTime(date: Date, hours: number): Date {
  const result = new Date(date)
  if (hours >= 24) {
    const daysToAdd = Math.floor(hours / 24)
    const remainingHours = hours % 24
    const h = Math.floor(remainingHours)
    const m = Math.round((remainingHours % 1) * 60)
    result.setDate(result.getDate() + daysToAdd)
    result.setHours(h, m, 0, 0)
  } else {
    const h = Math.floor(hours)
    const m = Math.round((hours % 1) * 60)
    result.setHours(h, m, 0, 0)
  }
  return result
}

/**
 * Create a UTC datetime from a date and decimal hours in the user's timezone.
 * Used so "9:00" in available_time is stored as 9:00 user local → correct UTC.
 *
 * @param date - Date (calendar day)
 * @param hours - Decimal hours in user's local time (e.g. 9.5, or 26.0 for 2 AM next day)
 * @param userTimezone - IANA timezone (e.g. Europe/Paris)
 * @returns Full datetime in UTC
 */
function createDateTimeInTimezone(date: Date, hours: number, userTimezone: string): Date {
  let d = new Date(date)
  let h = hours
  if (hours >= 24) {
    const daysToAdd = Math.floor(hours / 24)
    d = addDays(d, daysToAdd)
    h = hours % 24
  }
  const dateStr = d.toISOString().split('T')[0]
  const hour = Math.floor(h)
  const minute = Math.round((h % 1) * 60)
  return localTimeInTimezoneToUTC(dateStr, hour, minute, userTimezone)
}

const DAY_NUM_TO_NAME = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** Breathing room between consecutive tasks in the same window (Session 4). */
const GAP_BETWEEN_TASKS_HOURS = 15 / 60 // 15 minutes

/** Minimum fragment when splitting a task (Session 4). */
const MIN_FRAGMENT_HOURS = 0.5 // 30 minutes

/**
 * Get local time-of-day in decimal hours for a Date in the given timezone.
 */
function getLocalHoursInTimezone(d: Date, tz: string): number {
  const timeStr = d.toLocaleTimeString('en-CA', { timeZone: tz, hour12: false })
  const [h, m] = timeStr.split(':').map(Number)
  return h + (m || 0) / 60
}

/**
 * Get local date string (YYYY-MM-DD) for a Date in the given timezone.
 */
function getLocalDateStrInTimezone(d: Date, tz: string): string {
  return d.toLocaleDateString('en-CA', { timeZone: tz })
}

/**
 * Compute how much of a slot is already used by scheduledTasks (same day, overlapping time).
 * Returns used hours (including gaps) and the next start hour within the slot.
 */
function getSlotUsedState(
  scheduledTasks: ScheduledTaskAssignment[],
  currentDate: Date,
  slot: TimeSlot,
  userTimezone: string
): { usedHours: number; nextStartHours: number } {
  const currentDateStr = getLocalDateStrInTimezone(currentDate, userTimezone)
  const slotDuration = slot.flexibleHours ?? (slot.endHours - slot.startHours)
  const assignmentsInSlot: ScheduledTaskAssignment[] = []
  for (const a of scheduledTasks) {
    const aDateStr = getLocalDateStrInTimezone(a.date, userTimezone)
    if (aDateStr !== currentDateStr) continue
    const startH = getLocalHoursInTimezone(a.startTime, userTimezone)
    const endH = getLocalHoursInTimezone(a.endTime, userTimezone)
    if (startH >= slot.endHours || endH <= slot.startHours) continue
    assignmentsInSlot.push(a)
  }
  if (assignmentsInSlot.length === 0) {
    return { usedHours: 0, nextStartHours: slot.startHours }
  }
  assignmentsInSlot.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  let nextStartHours = slot.startHours
  for (const a of assignmentsInSlot) {
    const aEnd = getLocalHoursInTimezone(a.endTime, userTimezone)
    const endPlusGap = aEnd + GAP_BETWEEN_TASKS_HOURS
    if (endPlusGap > nextStartHours) nextStartHours = endPlusGap
  }
  const usedHours = nextStartHours - slot.startHours
  return { usedHours, nextStartHours }
}

/**
 * Compute slot type for smart scheduling (Session 4).
 * Uses energy_peak when set; otherwise infers from window_type. Weekend and emergency/late_night get special handling.
 * Session 2: label/type may contain "emergency" or "late_night" (e.g. "late_night_emergency"); overnight 22:00–02:00 → emergency.
 */
function getSlotType(
  day: string,
  startHours: number,
  windowType: 'fixed' | 'flexible' | undefined,
  blockType: string | undefined,
  energyPeak: string | null | undefined,
  endHours?: number
): SlotType {
  const dayLower = day.toLowerCase()
  // Weekend → flexible regardless of energy_peak
  if (dayLower === 'saturday' || dayLower === 'sunday') {
    return 'flexible'
  }
  // Emergency: label/type contains "emergency" or "late_night" (e.g. late_night_emergency)
  const blockTypeLower = (blockType ?? '').toLowerCase()
  if (blockTypeLower.includes('late_night') || blockTypeLower.includes('emergency')) {
    return 'emergency'
  }
  // Late-night window crossing midnight (e.g. 22:00–02:00) → emergency
  if (typeof endHours === 'number' && endHours < startHours && startHours >= 22) {
    return 'emergency'
  }
  if (energyPeak) {
    const peak = energyPeak.toLowerCase()
    // Classify by slot start time: morning 05:00-11:59, afternoon 12:00-17:59, evening 18:00-23:59
    const isMorning = startHours >= 5 && startHours < 12
    const isAfternoon = startHours >= 12 && startHours < 18
    const isEvening = startHours >= 18 || startHours < 5
    const isPeak =
      (peak === 'morning' && isMorning) || (peak === 'afternoon' && isAfternoon) || (peak === 'evening' && isEvening)
    if (isPeak) return 'peak_energy'
    return windowType === 'flexible' ? 'flexible' : 'normal'
  }
  // energy_peak null: fixed windows → peak_energy (user committed to that time), flexible → normal
  if (windowType === 'fixed') return 'peak_energy'
  if (windowType === 'flexible') return 'normal'
  return 'normal'
}

/**
 * Build blocked time slots from User.workSchedule and User.commute.
 * Used to subtract work/commute from available_time so scheduling only uses free slots.
 * Supports multiple work blocks per day (workSchedule.blocks) or legacy single startTime/endTime.
 */
function buildBlockedSlotsFromUser(userBlocked: UserBlockedInput): Map<string, TimeSlot[]> {
  const blocked = new Map<string, TimeSlot[]>()

  const addSlot = (day: string, startHours: number, endHours: number) => {
    if (!blocked.has(day)) blocked.set(day, [])
    blocked.get(day)!.push({ day, startHours, endHours })
  }

  const ws = userBlocked.workSchedule
  if (!ws) return blocked

  if (Array.isArray(ws.blocks) && ws.blocks.length > 0) {
    for (const b of ws.blocks) {
      const days = Array.isArray(b.days) && b.days.length > 0 ? b.days : [1, 2, 3, 4, 5]
      const startHours = parseTimeToHours(b.startTime)
      const endHours = parseTimeToHours(b.endTime)
      if (endHours <= startHours) continue
      for (const d of days) {
        if (d >= 0 && d <= 6) addSlot(DAY_NUM_TO_NAME[d], startHours, endHours)
      }
    }
  } else if (ws.workDays?.length && ws.startTime && ws.endTime) {
    const startHours = parseTimeToHours(ws.startTime)
    const endHours = parseTimeToHours(ws.endTime)
    for (const d of ws.workDays) {
      if (d >= 0 && d <= 6) addSlot(DAY_NUM_TO_NAME[d], startHours, endHours)
    }
  }

  if (userBlocked.commute?.morning) {
    const { durationMinutes, startTime } = userBlocked.commute.morning
    const startHours = parseTimeToHours(startTime)
    const endHours = startHours + durationMinutes / 60
    for (const day of DAY_NUM_TO_NAME) addSlot(day, startHours, endHours)
  }
  if (userBlocked.commute?.evening) {
    const { durationMinutes, startTime } = userBlocked.commute.evening
    const startHours = parseTimeToHours(startTime)
    const endHours = startHours + durationMinutes / 60
    for (const day of DAY_NUM_TO_NAME) addSlot(day, startHours, endHours)
  }

  for (const [day, slots] of blocked) {
    slots.sort((a, b) => a.startHours - b.startHours)
    blocked.set(day, slots)
  }
  return blocked
}

/**
 * Subtract blocked ranges from a list of available slots on one day.
 * Returns new slots that don't overlap blocked.
 */
function subtractBlockedFromSlots(
  slots: TimeSlot[],
  blockedSlots: TimeSlot[]
): TimeSlot[] {
  if (blockedSlots.length === 0) return slots
  const result: TimeSlot[] = []
  for (const slot of slots) {
    let sStart = slot.startHours
    const sEnd = slot.endHours
    for (const b of blockedSlots) {
      if (b.endHours <= sStart || b.startHours >= sEnd) continue
      const bStart = Math.max(b.startHours, sStart)
      const bEnd = Math.min(b.endHours, sEnd)
      if (sStart < bStart) result.push({ ...slot, startHours: sStart, endHours: bStart })
      sStart = bEnd
    }
    if (sStart < sEnd) result.push({ ...slot, startHours: sStart, endHours: sEnd })
  }
  return result.sort((a, b) => a.startHours - b.startHours)
}

/**
 * Build availability map from constraints (available_time) and subtract User work/commute.
 * Groups available time by day of week; blocks from User.workSchedule and User.commute are excluded.
 * Flexible blocks (flexible_hours set) use that as slot capacity and are not subtracted (already the user's capacity within the boundary).
 * Session 4: when energyPeak is provided, each slot gets a slotType for smart matching.
 *
 * @param constraints - Extracted constraints (available_time from Project.contextData)
 * @param userBlocked - Optional User life constraints; blocked time is derived from these
 * @param energyPeak - Optional "morning"|"afternoon"|"evening" for slot type classification
 * @returns Map of day → array of time slots (free to schedule)
 */
function buildAvailabilityMap(
  constraints: ExtractedConstraints,
  userBlocked?: UserBlockedInput | null,
  energyPeak?: string | null
): Map<string, TimeSlot[]> {
  const availability = new Map<string, TimeSlot[]>()
  const blocks = constraints.available_time || []
  const blockWithMeta = (b: TimeBlock) => b as TimeBlock & { window_type?: 'fixed' | 'flexible'; label?: string; flexible_hours?: number }
  const isFlexibleBlock = (b: TimeBlock): boolean => {
    const meta = blockWithMeta(b)
    const hasFlexHours = typeof meta.flexible_hours === 'number' && meta.flexible_hours > 0
    const isFlexType = meta.window_type === 'flexible'
    return hasFlexHours || isFlexType
  }
  const fixedBlocks = blocks.filter((b) => !isFlexibleBlock(b))
  const flexibleBlocks = blocks.filter(isFlexibleBlock)

  // Fixed blocks: add then subtract User work/commute
  for (const block of fixedBlocks) {
    const day = block.day.toLowerCase()
    const startHours = parseTimeToHours(block.start)
    const endHours = parseTimeToHours(block.end)
    const windowType = blockWithMeta(block).window_type ?? 'fixed'
    const slotType = getSlotType(day, startHours, windowType, blockWithMeta(block).label, energyPeak, endHours)

    if (!availability.has(day)) {
      availability.set(day, [])
    }

    if (endHours < startHours) {
      const adjustedEndHours = 24.0 + endHours
      availability.get(day)!.push({
        day,
        startHours: startHours,
        endHours: adjustedEndHours,
        label: block.label,
        slotType,
      })
    } else {
      availability.get(day)!.push({
        day,
        startHours: startHours,
        endHours: endHours,
        label: block.label,
        slotType,
      })
    }
  }

  // Subtract User work/commute from fixed slots only
  const hasWorkSchedule =
    userBlocked?.workSchedule &&
    (userBlocked.workSchedule.workDays?.length ||
      (Array.isArray(userBlocked.workSchedule.blocks) && userBlocked.workSchedule.blocks.length > 0))
  if (userBlocked && (hasWorkSchedule || userBlocked.commute?.morning || userBlocked.commute?.evening)) {
    const blockedMap = buildBlockedSlotsFromUser(userBlocked)
    for (const [day, slots] of availability) {
      const blockedSlots = blockedMap.get(day) || []
      const subtracted = subtractBlockedFromSlots(slots, blockedSlots)
      availability.set(day, subtracted.filter((s) => s.endHours - s.startHours >= 0.5))
    }
  }

  // Flexible blocks (Session 2): capacity and slot end MUST use flexible_hours when present; never use boundary end − start for capacity
  for (const block of flexibleBlocks) {
    const b = block as { day: string; start: string; end: string; flexible_hours?: number; label?: string; window_type?: 'flexible' }
    const day = b.day.toLowerCase()
    const startHours = parseTimeToHours(b.start)
    let flexHours: number
    if (typeof b.flexible_hours === 'number' && b.flexible_hours > 0) {
      flexHours = b.flexible_hours
    } else {
      const boundaryHours = parseTimeToHours(b.end) - startHours
      flexHours = boundaryHours > 0 ? boundaryHours : 1
      console.warn(
        `[TaskScheduler] Flexible block ${day} ${b.start}-${b.end} has no flexible_hours; using boundary duration ${flexHours}h. Set flexible_hours for correct capacity.`
      )
    }
    const endHours = startHours + flexHours
    const rawEndHours = parseTimeToHours(b.end)
    const slotType = getSlotType(day, startHours, 'flexible', b.label, energyPeak, rawEndHours)

    if (!availability.has(day)) {
      availability.set(day, [])
    }
    availability.get(day)!.push({
      day,
      startHours,
      endHours,
      label: b.label,
      flexibleHours: flexHours,
      windowStart: b.start,
      windowEnd: b.end,
      slotType,
    })
  }

  for (const [day, slots] of availability) {
    slots.sort((a, b) => a.startHours - b.startHours)
    availability.set(day, slots)
  }

  // Structured logs: every slot with type, start, end, capacity
  for (const [day, slots] of availability) {
    for (const s of slots) {
      const type = s.slotType ?? 'normal'
      const capacityH = s.flexibleHours ?? (s.endHours - s.startHours)
      const capacityStr = capacityH >= 1 ? `${capacityH}h` : `${Math.round(capacityH * 60)}min`
      const startStr = formatHoursToTime(s.startHours)
      const endStr = formatHoursToTime(s.endHours >= 24 ? s.endHours - 24 : s.endHours)
      console.log(`[TaskScheduler] SlotMap: ${day} ${startStr}-${endStr} → type=${type} capacity=${capacityStr}`)
    }
  }

  return availability
}

/**
 * Build effective available_time (available_time minus User work/commute) for tools that need it.
 * Returns array of { day, start, end } suitable for contextData.available_time shape.
 *
 * @param availableTime - From Project.contextData.available_time
 * @param userBlocked - From User.workSchedule and User.commute
 * @returns Effective available time blocks (work/commute subtracted)
 */
export function getEffectiveAvailableTimeBlocks(
  availableTime: TimeBlock[],
  userBlocked?: UserBlockedInput | null
): TimeBlock[] {
  if (!availableTime?.length) return []
  const constraints: ExtractedConstraints = {
    schedule_duration_weeks: 2,
    blocked_time: [],
    available_time: availableTime,
    preferences: {},
  }
  const map = buildAvailabilityMap(constraints, userBlocked ?? null)
  const result: TimeBlock[] = []
  for (const [day, slots] of map) {
    for (const s of slots) {
      if (s.endHours - s.startHours < 0.5) continue
      result.push({
        day,
        start: formatHoursToTime(s.startHours),
        end: formatHoursToTime(s.endHours >= 24 ? s.endHours - 24 : s.endHours),
      })
    }
  }
  return result
}

/**
 * Calculate start date based on user preference IN USER'S TIMEZONE
 *
 * @param constraints - Extracted constraints with preferences
 * @param userTimezone - User's timezone (e.g., "Europe/Paris", "America/New_York")
 * @returns Start date for scheduling (normalized to midnight in user's timezone)
 */
export function calculateStartDate(
  constraints: ExtractedConstraints,
  userTimezone: string = 'UTC'
): Date {
  const preference = (constraints.preferences as Record<string, unknown>)?.start_preference as
    | string
    | undefined

  // Get "today" in user's timezone
  const now = new Date()
  const userNow = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }))
  const today = new Date(userNow)
  today.setHours(0, 0, 0, 0)

  // ALWAYS check preference first, even if undefined
  const pref = preference?.toLowerCase() || ''
  
  // Handle explicit preferences
  if (pref === 'today') {
    console.log('[ScheduleGeneration] Start preference: TODAY')
    return today
  }

  if (pref === 'tomorrow') {
    console.log('[ScheduleGeneration] Start preference: TOMORROW')
    return addDays(today, 1)
  }

  if (pref === 'next_monday' || pref === 'monday') {
    console.log('[ScheduleGeneration] Start preference: NEXT MONDAY')
    return getNextMonday(today)
  }

  // Try to parse as date string (YYYY-MM-DD)
  if (pref) {
    const dateMatch = pref.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (dateMatch) {
      const parsed = new Date(pref)
      if (!isNaN(parsed.getTime())) {
        parsed.setHours(0, 0, 0, 0)
        // Don't schedule in the past
        return parsed < today ? today : parsed
      }
    }
  }

  // Default: tomorrow or next Monday if today is Friday/weekend
  console.log('[ScheduleGeneration] No preference specified, using default logic')
  const dayOfWeek = today.getDay()
  if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
    // Friday, Saturday, Sunday → next Monday
    return getNextMonday(today)
  }
  // Otherwise tomorrow
  return addDays(today, 1)
}


// ============================================
// Dependency ordering
// ============================================

/**
 * Returns task indices in dependency-respecting order (topological sort).
 * Tasks with depends_on (1-based indices) are scheduled after their dependencies.
 * If there is a cycle or invalid ref, falls back to original order for affected nodes.
 *
 * @param tasks - Parsed tasks with optional depends_on (1-based)
 * @returns Indices order that respects dependencies
 */
function sortIndicesByDependencies(tasks: ParsedTask[]): number[] {
  const n = tasks.length
  const indices = tasks.map((_, i) => i)

  // dependents[i] = list of task indices j that depend on task i (i.e. tasks[j].depends_on contains i+1)
  const dependents: number[][] = Array.from({ length: n }, () => [])
  const inDegree = new Array(n).fill(0)

  for (let j = 0; j < n; j++) {
    const deps = tasks[j].depends_on || []
    for (const oneBased of deps) {
      const i = oneBased - 1
      if (i >= 0 && i < n && i !== j) {
        dependents[i].push(j)
        inDegree[j]++
      }
    }
  }

  const queue: number[] = []
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i)
  }

  const order: number[] = []
  while (queue.length > 0) {
    const i = queue.shift()!
    order.push(i)
    for (const j of dependents[i]) {
      inDegree[j]--
      if (inDegree[j] === 0) queue.push(j)
    }
  }

  // If cycle or missing refs, append any remaining indices in original order
  const seen = new Set(order)
  const remaining = indices.filter((i) => !seen.has(i))
  if (remaining.length > 0) {
    console.warn(
      `[TaskScheduler] ⚠️ Dependency order: ${remaining.length} task(s) had cycles or invalid depends_on refs and were appended at end. Order may place dependents before dependencies. Indices: ${remaining.join(', ')}`
    )
    for (const i of remaining) order.push(i)
  }

  return order
}

/** Priority to number for ordering (1 = high first). */
function priorityOrder(p: string): number {
  if (p === 'high') return 1
  if (p === 'medium') return 2
  if (p === 'low') return 3
  return 2
}

/** energy_required to number for ordering (high first). */
function energyOrder(e: string | undefined): number {
  if (e === 'high') return 1
  if (e === 'medium') return 2
  if (e === 'low') return 3
  return 2
}

/**
 * Sort task indices: dependency order first, then within same dependency layer by priority (high first), then energy_required (high first).
 * Session 4: harder tasks earlier in the week while respecting dependencies.
 */
function sortIndicesByDependenciesThenPriorityAndEnergy(tasks: ParsedTask[]): number[] {
  const depOrder = sortIndicesByDependencies(tasks)
  const n = tasks.length
  const layer = new Array(n).fill(0)
  for (const i of depOrder) {
    const deps = tasks[i].depends_on || []
    let maxLayer = 0
    for (const oneBased of deps) {
      const j = oneBased - 1
      if (j >= 0 && j < n) maxLayer = Math.max(maxLayer, layer[j] + 1)
    }
    layer[i] = maxLayer
  }
  return [...depOrder].sort((a, b) => {
    if (layer[a] !== layer[b]) return layer[a] - layer[b]
    const pa = priorityOrder(tasks[a].priority)
    const pb = priorityOrder(tasks[b].priority)
    if (pa !== pb) return pa - pb
    const ea = energyOrder(tasks[a].energy_required)
    const eb = energyOrder(tasks[b].energy_required)
    return ea - eb
  })
}

/** Slot type order for trying non-emergency first (Session 4). */
const SLOT_TYPE_ORDER: Record<SlotType, number> = {
  peak_energy: 0,
  normal: 1,
  flexible: 2,
  emergency: 3,
}

// ============================================
// Main Scheduling Function
// ============================================

/**
 * Assign tasks to specific dates and time slots based on available time
 *
 * This is the main scheduling algorithm, adapted from the Telegram bot.
 * Session 4: respects slot types (peak_energy/normal/flexible/emergency), task preferred_slot, 15 min breathing room, min 30 min fragment, day-1 ramp-up, emergency slots last.
 *
 * @param tasks - Array of parsed tasks with hours, priority, energy_required, preferred_slot
 * @param constraints - Project constraints (available_time from contextData)
 * @param startDate - When to start scheduling
 * @param durationWeeks - How many weeks to schedule
 * @param userTimezone - User's IANA timezone (e.g. Europe/Paris) so times are stored in UTC
 * @param userBlocked - Optional User life constraints (workSchedule, commute); blocked time is subtracted from available slots
 * @param options - Session 4: energyPeak, preferredSessionLength, rampUpDay1, etc.
 * @returns Schedule result with assigned tasks
 */
export function assignTasksToSchedule(
  tasks: ParsedTask[],
  constraints: ExtractedConstraints,
  startDate: Date,
  durationWeeks: number,
  userTimezone: string = 'UTC',
  userBlocked?: UserBlockedInput | null,
  options?: SchedulerOptions | null
): ScheduleResult {
  const energyPeak = options?.energyPeak ?? constraints.energy_peak ?? null
  const rampUpDay1 = options?.rampUpDay1 ?? false

  console.log(
    `[TaskScheduler] Starting scheduling: ${tasks.length} tasks, ${durationWeeks} weeks, starting ${startDate.toISOString().split('T')[0]}`
  )

  const scheduledTasks: ScheduledTaskAssignment[] = []
  let totalHoursScheduled = 0

  /** When a task is split, Part N+1 can only be placed in slots starting after Part N ends (same day or later). */
  const earliestStartForContinuation = new Map<number, Date>()

  // Build availability map with slot types (Session 4)
  const availability = buildAvailabilityMap(constraints, userBlocked, energyPeak)

  // Session 4: order by dependency, then within layer by priority (high first), then energy_required (high first)
  const sortedTaskIndices = sortIndicesByDependenciesThenPriorityAndEnergy(tasks)

  // Log task sort order with energy_required, priority, preferred_slot
  sortedTaskIndices.forEach((taskIndex, orderPos) => {
    const t = tasks[taskIndex]
    console.log(
      `[TaskScheduler] TaskOrder: #${orderPos + 1} "${t.title}" energy=${t.energy_required ?? '—'} priority=${t.priority} preferred=${t.preferred_slot ?? '—'}`
    )
  })

  const remainingTasks: RemainingTask[] = sortedTaskIndices.map((taskIndex) => ({
    taskIndex,
    task: tasks[taskIndex],
    remainingHours: tasks[taskIndex].hours,
    partNumber: 1,
  }))

  const totalDays = durationWeeks * 7

  // Log schedule order: week is start_date forward, not calendar Mon–Sun (Session 2)
  const scheduleOrderLines: string[] = []
  for (let i = 0; i < Math.min(7, totalDays); i++) {
    const d = addDays(startDate, i)
    scheduleOrderLines.push(`day${i}=${d.toISOString().split('T')[0]} (${getDayName(d)})`)
  }
  console.log(`[TaskScheduler] Schedule order (start_date forward): ${scheduleOrderLines.join(', ')}`)

  // Helper: pick best task from remaining for this slot (prefer preferred_slot match; rampUpDay1: on day 0 prefer medium/low)
  function pickTaskForSlot(
    slotType: SlotType | undefined,
    dayNum: number,
    remaining: RemainingTask[]
  ): RemainingTask | null {
    if (remaining.length === 0) return null
    if (slotType === 'emergency') return remaining[0]
    if (rampUpDay1 && dayNum === 0) {
      const mediumOrLow = remaining.find((r) => r.task.energy_required === 'medium' || r.task.energy_required === 'low')
      if (mediumOrLow) return mediumOrLow
    }
    const preferred = slotType ?? 'normal'
    const match = remaining.find((r) => r.task.preferred_slot === preferred)
    if (match) return match
    const fallback = remaining.find((r) => r.task.preferred_slot === 'flexible')
    return fallback ?? remaining[0]
  }

  /** Session 2: same-day dependency ordering — can this task be placed in this slot? (every dependency on this day must end before slot start) */
  function canPlaceTaskInSlot(
    taskIndex: number,
    currentDate: Date,
    slotStartHours: number,
    assignedSoFar: ScheduledTaskAssignment[]
  ): boolean {
    const slotStartMs = createDateTimeInTimezone(currentDate, slotStartHours, userTimezone).getTime()
    const deps = tasks[taskIndex].depends_on ?? []
    for (const oneBased of deps) {
      const depIndex = oneBased - 1
      const depOnDay = assignedSoFar.filter(
        (s) => s.taskIndex === depIndex && s.date.getTime() === currentDate.getTime()
      )
      if (depOnDay.length === 0) continue
      const depEndMs = Math.max(...depOnDay.map((a) => a.endTime.getTime()))
      if (depEndMs > slotStartMs) return false
    }
    return true
  }

  /**
   * Schedule all remaining parts of a split task consecutively (no other tasks between parts).
   * Called after Part 1 is assigned; finds the next slot(s) after afterTime and assigns Part 2, 3, ... until done.
   */
  function scheduleRemainingPartsConsecutively(
    task: RemainingTask,
    afterTime: Date,
    useEmergencySlots: boolean
  ): void {
    while (task.remainingHours > 0) {
      let found = false
      for (let dayNum = 0; dayNum < totalDays && !found; dayNum++) {
        const currentDate = addDays(startDate, dayNum)
        const dayName = getDayName(currentDate)
        let daySlots = availability.get(dayName) || []
        daySlots = daySlots.filter((s) => (s.slotType === 'emergency') === useEmergencySlots)
        daySlots = [...daySlots].sort(
          (a, b) => (SLOT_TYPE_ORDER[a.slotType ?? 'normal'] ?? 2) - (SLOT_TYPE_ORDER[b.slotType ?? 'normal'] ?? 2)
        )
        for (const slot of daySlots) {
          const { usedHours, nextStartHours } = getSlotUsedState(scheduledTasks, currentDate, slot, userTimezone)
          const slotDuration = slot.flexibleHours ?? (slot.endHours - slot.startHours)
          const remainingInSlot = slotDuration - usedHours
          if (remainingInSlot < MIN_FRAGMENT_HOURS) continue
          const nextStart = createDateTimeInTimezone(currentDate, nextStartHours, userTimezone)
          if (nextStart.getTime() < afterTime.getTime()) continue
          const hoursThisPart = Math.min(task.remainingHours, remainingInSlot)
          if (hoursThisPart < MIN_FRAGMENT_HOURS) continue
          if (!canPlaceTaskInSlot(task.taskIndex, currentDate, nextStartHours, scheduledTasks)) continue

          found = true
          const taskEndHours = nextStartHours + hoursThisPart
          const timeBlockStr = `${formatHoursToTime(nextStartHours)}-${formatHoursToTime(taskEndHours)}`
          const isFlexibleSlot = slot.flexibleHours != null
          const slotType = slot.slotType ?? 'normal'
          if (useEmergencySlots) emergencySlotsUsed += 1
          console.log(
            `[TaskScheduler] Consecutive: task="${task.task.title}" Part ${task.partNumber} → ${dayName} ${timeBlockStr} [${slotType}] ✅`
          )
          scheduledTasks.push({
            taskIndex: task.taskIndex,
            task: task.task,
            date: new Date(currentDate),
            startTime: createDateTimeInTimezone(currentDate, nextStartHours, userTimezone),
            endTime: createDateTimeInTimezone(currentDate, taskEndHours, userTimezone),
            timeBlock: isFlexibleSlot
              ? `${slot.windowStart ?? formatHoursToTime(slot.startHours)}-${slot.windowEnd ?? formatHoursToTime(slot.endHours)}`
              : timeBlockStr,
            partNumber: task.partNumber,
            hoursAssigned: hoursThisPart,
            ...(isFlexibleSlot && { isFlexible: true, windowStart: slot.windowStart, windowEnd: slot.windowEnd }),
            slotType,
          })
          totalHoursScheduled += hoursThisPart
          task.remainingHours -= hoursThisPart
          task.partNumber += 1
          afterTime = createDateTimeInTimezone(currentDate, taskEndHours + GAP_BETWEEN_TASKS_HOURS, userTimezone)
          if (task.remainingHours > 0) {
            earliestStartForContinuation.set(task.taskIndex, afterTime)
          } else {
            earliestStartForContinuation.delete(task.taskIndex)
            const idx = remainingTasks.indexOf(task)
            if (idx >= 0) remainingTasks.splice(idx, 1)
          }
          break
        }
      }
      if (!found) break
    }
  }

  let emergencySlotsUsed = 0

  // Two passes: first non-emergency slots, then emergency (Session 4)
  for (const useEmergency of [false, true]) {
    if (remainingTasks.length === 0) break

    if (useEmergency && remainingTasks.length > 0) {
      const dateStr = startDate.toISOString().split('T')[0]
      console.log(
        `[TaskScheduler] Emergency: all normal/flexible/peak slots exhausted → using emergency buffer (remaining ${remainingTasks.length} tasks)`
      )
    }

    // Iterate all days from start_date (including weekends); no weekday-only filter (Session 2)
    for (let dayNum = 0; dayNum < totalDays; dayNum++) {
      if (remainingTasks.length === 0) break

      const currentDate = addDays(startDate, dayNum)
      const dayName = getDayName(currentDate)
      const dateStr = currentDate.toISOString().split('T')[0]
      let dayTaskCount = scheduledTasks.filter((s) => s.date.getTime() === currentDate.getTime()).length

      let daySlots = availability.get(dayName) || []
      daySlots = daySlots.filter((s) => (s.slotType === 'emergency') === useEmergency)
      daySlots = [...daySlots].sort((a, b) => (SLOT_TYPE_ORDER[a.slotType ?? 'normal'] ?? 2) - (SLOT_TYPE_ORDER[b.slotType ?? 'normal'] ?? 2))

      for (const slot of daySlots) {
        if (remainingTasks.length === 0) break
        if (rampUpDay1 && dayNum === 0 && dayTaskCount >= 2) {
          const nextTask = remainingTasks[0]
          console.log(
            `[TaskScheduler] RampUp: day=0 (${dateStr}) taskCount=${dayTaskCount} → limit reached, deferring "${nextTask.task.title}" to next day`
          )
          break
        }

        const slotDuration = slot.flexibleHours ?? (slot.endHours - slot.startHours)
        if (slotDuration <= 0) continue

        const usedState = getSlotUsedState(scheduledTasks, currentDate, slot, userTimezone)
        let slotFilled = usedState.usedHours
        let currentSlotStartHours = usedState.nextStartHours
        const isFlexibleSlot = slot.flexibleHours != null
        const slotType = slot.slotType ?? 'normal'

        while (slotFilled < slotDuration && remainingTasks.length > 0) {
          if (rampUpDay1 && dayNum === 0 && dayTaskCount >= 2) break

          const remainingSlotTime = slotDuration - slotFilled
          if (remainingSlotTime < MIN_FRAGMENT_HOURS) {
            const slotStartStr = formatHoursToTime(slot.startHours)
            const slotEndStr = formatHoursToTime(slot.startHours + remainingSlotTime)
            console.log(
              `[TaskScheduler] Fragment: slot=${slotStartStr}-${slotEndStr} (${Math.round(remainingSlotTime * 60)}min) → fragment too small, skipping`
            )
            break
          }

          let chosen = pickTaskForSlot(slot.slotType, dayNum, remainingTasks)
          // Session 2: same-day dependency ordering — skip candidates whose dependency on this day ends after this slot start (cap iterations to avoid any hang)
          // Split-part ordering: Part N+1 can only be placed in slots starting after Part N ends (Option A: enforce sequential scheduling)
          let tries = 0
          const maxTries = Math.max(remainingTasks.length, 1)
          const slotStartTime = createDateTimeInTimezone(currentDate, currentSlotStartHours, userTimezone)
          while (
            chosen &&
            (tries < maxTries &&
              (!canPlaceTaskInSlot(chosen.taskIndex, currentDate, currentSlotStartHours, scheduledTasks) ||
                (earliestStartForContinuation.has(chosen.taskIndex) &&
                  slotStartTime.getTime() < earliestStartForContinuation.get(chosen.taskIndex)!.getTime())))
          ) {
            tries += 1
            const rest = remainingTasks.filter((r) => r !== chosen)
            chosen = pickTaskForSlot(slot.slotType, dayNum, rest)
          }
          if (!chosen) break
          const taskIdx = remainingTasks.indexOf(chosen)
          if (taskIdx < 0) break
          const task = remainingTasks[taskIdx]
          const preferred = task.task.preferred_slot ?? 'flexible'
          if (slotType !== preferred && slotType !== 'emergency') {
            console.log(
              `[TaskScheduler] SlotMatch: task="${task.task.title}" → no ${preferred} slot found, trying ${slotType}...`
            )
          }

          const taskHours = Math.min(task.remainingHours, remainingSlotTime)
          const fitsFull = task.remainingHours <= remainingSlotTime
          const canSplit = remainingSlotTime >= MIN_FRAGMENT_HOURS && task.remainingHours > remainingSlotTime && (task.remainingHours - remainingSlotTime) >= MIN_FRAGMENT_HOURS

          if (fitsFull) {
            const taskEndHours = currentSlotStartHours + task.remainingHours
            const timeBlockStr = `${formatHoursToTime(currentSlotStartHours)}-${formatHoursToTime(taskEndHours)}`
            if (useEmergency) emergencySlotsUsed += 1
            console.log(
              `[TaskScheduler] SlotMatch: task="${task.task.title}" → assigned ${dayName} ${timeBlockStr} [${slotType}] ✅`
            )
            scheduledTasks.push({
              taskIndex: task.taskIndex,
              task: task.task,
              date: new Date(currentDate),
              startTime: createDateTimeInTimezone(currentDate, currentSlotStartHours, userTimezone),
              endTime: createDateTimeInTimezone(currentDate, taskEndHours, userTimezone),
              timeBlock: isFlexibleSlot
                ? `${slot.windowStart ?? formatHoursToTime(slot.startHours)}-${slot.windowEnd ?? formatHoursToTime(slot.endHours)}`
                : timeBlockStr,
              partNumber: task.partNumber > 1 ? task.partNumber : undefined,
              hoursAssigned: task.remainingHours,
              ...(isFlexibleSlot && { isFlexible: true, windowStart: slot.windowStart, windowEnd: slot.windowEnd }),
              slotType,
            })
            totalHoursScheduled += task.remainingHours
            slotFilled += task.remainingHours + GAP_BETWEEN_TASKS_HOURS
            currentSlotStartHours = taskEndHours + GAP_BETWEEN_TASKS_HOURS
            const nextStartStr = formatHoursToTime(currentSlotStartHours)
            console.log(
              `[TaskScheduler] Gap: inserting 15min gap after ${dayName} ${timeBlockStr} → next slot starts ${nextStartStr}`
            )
            earliestStartForContinuation.delete(task.taskIndex)
            remainingTasks.splice(taskIdx, 1)
            dayTaskCount++
          } else if (canSplit) {
            const hoursThisSlot = remainingSlotTime
            const taskEndHours = currentSlotStartHours + hoursThisSlot
            const timeBlockStr = `${formatHoursToTime(currentSlotStartHours)}-${formatHoursToTime(taskEndHours)}`
            if (useEmergency) emergencySlotsUsed += 1
            console.log(
              `[TaskScheduler] SlotMatch: task="${task.task.title}" → assigned ${dayName} ${timeBlockStr} [${slotType}] (split) ✅`
            )
            scheduledTasks.push({
              taskIndex: task.taskIndex,
              task: task.task,
              date: new Date(currentDate),
              startTime: createDateTimeInTimezone(currentDate, currentSlotStartHours, userTimezone),
              endTime: createDateTimeInTimezone(currentDate, taskEndHours, userTimezone),
              timeBlock: isFlexibleSlot
                ? `${slot.windowStart ?? formatHoursToTime(slot.startHours)}-${slot.windowEnd ?? formatHoursToTime(slot.endHours)}`
                : timeBlockStr,
              partNumber: task.partNumber,
              hoursAssigned: hoursThisSlot,
              ...(isFlexibleSlot && { isFlexible: true, windowStart: slot.windowStart, windowEnd: slot.windowEnd }),
              slotType,
            })
            totalHoursScheduled += hoursThisSlot
            slotFilled += hoursThisSlot + GAP_BETWEEN_TASKS_HOURS
            currentSlotStartHours = taskEndHours + GAP_BETWEEN_TASKS_HOURS
            const partEndPlusGap = createDateTimeInTimezone(currentDate, taskEndHours + GAP_BETWEEN_TASKS_HOURS, userTimezone)
            earliestStartForContinuation.set(task.taskIndex, partEndPlusGap)
            console.log(
              `[TaskScheduler] Gap: inserting 15min gap after ${dayName} ${timeBlockStr} → scheduling remaining parts consecutively`
            )
            task.remainingHours -= hoursThisSlot
            task.partNumber += 1
            dayTaskCount++
            scheduleRemainingPartsConsecutively(task, partEndPlusGap, useEmergency)
            break
          } else {
            const needMin = Math.round(task.remainingHours * 60)
            const slotMin = Math.round(remainingSlotTime * 60)
            console.log(
              `[TaskScheduler] Fragment: slot=${formatHoursToTime(currentSlotStartHours)}-${formatHoursToTime(currentSlotStartHours + remainingSlotTime)} (${slotMin}min) task needs ${needMin}min → fragment too small, skipping`
            )
            break
          }
        }
      }
    }
  }

  // Dependency check: log conflicts (task scheduled before a dependency)
  const taskIndexToDate = new Map<number, Date>()
  for (const st of scheduledTasks) {
    const existing = taskIndexToDate.get(st.taskIndex)
    if (!existing || st.date.getTime() < existing.getTime()) {
      taskIndexToDate.set(st.taskIndex, st.date)
    }
  }
  for (const st of scheduledTasks) {
    const deps = st.task.depends_on ?? []
    const myDate = st.date.toISOString().split('T')[0]
    for (const oneBased of deps) {
      const depIndex = oneBased - 1
      const depDate = taskIndexToDate.get(depIndex)
      if (depDate) {
        const depDateStr = depDate.toISOString().split('T')[0]
        if (depDateStr > myDate) {
          const depTask = tasks[depIndex]
          console.log(
            `[TaskScheduler] DependencyCheck: task="${st.task.title}" depends on "${depTask?.title ?? '?'}" → ${depTask?.title ?? '?'} scheduled ${depDateStr}, ${st.task.title} attempting ${myDate} ❌ CONFLICT`
          )
          console.log(
            `[TaskScheduler] DependencyCheck: rescheduling "${st.task.title}" to after ${depDateStr}... (note: scheduler does not auto-reschedule; order was dependency-based)`
          )
        }
      }
    }
  }

  // Calculate unscheduled tasks
  const scheduledTaskIndices = new Set(scheduledTasks.map((st) => st.taskIndex))
  const unscheduledTaskIndices: number[] = []
  let totalHoursUnscheduled = 0

  for (const task of remainingTasks) {
    if (!scheduledTaskIndices.has(task.taskIndex)) {
      unscheduledTaskIndices.push(task.taskIndex)
      totalHoursUnscheduled += task.remainingHours
    } else {
      // Partially scheduled task
      totalHoursUnscheduled += task.remainingHours
    }
  }

  // Per-day capacity: total (flexible + fixed), used, remaining
  const dayNameToUsedHours = new Map<string, number>()
  for (const st of scheduledTasks) {
    const day = getDayName(st.date)
    dayNameToUsedHours.set(day, (dayNameToUsedHours.get(day) ?? 0) + st.hoursAssigned)
  }
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  for (const day of dayOrder) {
    const slots = availability.get(day) ?? []
    let totalH = 0
    let flexibleH = 0
    let fixedH = 0
    for (const s of slots) {
      const cap = s.flexibleHours ?? (s.endHours - s.startHours)
      totalH += cap
      if (s.flexibleHours != null) flexibleH += cap
      else fixedH += cap
    }
    const used = dayNameToUsedHours.get(day) ?? 0
    const remaining = Math.max(0, totalH - used)
    if (totalH > 0) {
      const parts = []
      if (flexibleH > 0) parts.push(`${flexibleH}h flexible`)
      if (fixedH > 0) parts.push(`${fixedH}h fixed`)
      console.log(
        `[TaskScheduler] Capacity: ${day} total=${totalH.toFixed(1)}h (${parts.join(' + ')}), used=${used.toFixed(1)}h, remaining=${remaining.toFixed(1)}h`
      )
    }
  }

  console.log(
    `[TaskScheduler] Summary: scheduled=${scheduledTasks.length} tasks, unscheduled=${unscheduledTaskIndices.length}, total_hours=${totalHoursScheduled.toFixed(1)}h, emergency_used=${emergencySlotsUsed}`
  )

  // Sort scheduled tasks by date and time
  scheduledTasks.sort((a, b) => {
    const dateCompare = a.date.getTime() - b.date.getTime()
    if (dateCompare !== 0) return dateCompare
    return a.startTime.getTime() - b.startTime.getTime()
  })

  // Session 2: weekend stats for coaching message
  const weekendHoursUsed =
    (dayNameToUsedHours.get('saturday') ?? 0) + (dayNameToUsedHours.get('sunday') ?? 0)
  let weekendHoursAvailable = 0
  for (const day of ['saturday', 'sunday'] as const) {
    for (const s of availability.get(day) ?? []) {
      weekendHoursAvailable += s.flexibleHours ?? (s.endHours - s.startHours)
    }
  }

  return {
    scheduledTasks,
    unscheduledTaskIndices,
    totalHoursScheduled,
    totalHoursUnscheduled,
    weekendHoursUsed,
    weekendHoursAvailable,
  }
}

/**
 * Map scheduled task assignments back to database task format
 *
 * For tasks that are split across multiple slots, this returns the FIRST
 * scheduled slot's datetime as the task's scheduled time. The task will
 * appear on that day in the dashboard.
 * For flexible tasks, scheduledStartTime/scheduledEndTime are null; window_start/window_end and is_flexible are set.
 *
 * @param taskIndex - Index of the task in the original array
 * @param scheduledTasks - All scheduled task assignments
 * @returns Database-ready schedule data or null if not scheduled
 */
export function getTaskScheduleData(
  taskIndex: number,
  scheduledTasks: ScheduledTaskAssignment[]
): {
  scheduledDate: Date
  scheduledStartTime: Date | null
  scheduledEndTime: Date | null
  window_start?: string
  window_end?: string
  is_flexible?: boolean
} | null {
  const firstBlock = scheduledTasks.find((st) => st.taskIndex === taskIndex)

  if (!firstBlock) {
    return null
  }

  if (firstBlock.isFlexible) {
    return {
      scheduledDate: firstBlock.date,
      scheduledStartTime: null,
      scheduledEndTime: null,
      window_start: firstBlock.windowStart,
      window_end: firstBlock.windowEnd,
      is_flexible: true,
    }
  }

  return {
    scheduledDate: firstBlock.date,
    scheduledStartTime: firstBlock.startTime,
    scheduledEndTime: firstBlock.endTime,
  }
}
