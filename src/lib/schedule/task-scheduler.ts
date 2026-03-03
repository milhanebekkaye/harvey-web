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
 * 2. Sort tasks with dependency-safe ordering (phase heuristic, dependency layer, priority, energy).
 * 3. For each day in schedule period:
 *    - Get available slots for that day of week
 *    - For each slot, try to fit tasks by duration
 *    - If task doesn't fit, split it (min 30-minute chunks)
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
import { anthropic, withAnthropicRetry } from '../ai/claude-client'
import { MODELS } from '../ai/models'
import { logApiUsage } from '@/lib/ai/usage-logger'
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
  projectGoals?: string | null
  projectMotivation?: string | null
  phases?: {
    phases: Array<{
      id?: number
      title?: string | null
      goal?: string | null
      deadline?: string | null
      status?: string | null
    }>
    active_phase_id: number
  } | null
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

/** Claude request token ceiling for slot-assignment structured output. */
const CLAUDE_SCHEDULER_MAX_TOKENS = 4000

/** Claude model for slot-assignment structured output — from centralized config. */
const CLAUDE_SCHEDULER_MODEL = MODELS.TASK_SCHEDULER

/** Max attempts for Claude assignment (first pass + one validation-guided retry). */
const CLAUDE_SCHEDULER_MAX_ATTEMPTS = 2

/** Comparison tolerance for floating-point hour totals. */
const HOURS_EPSILON = 0.01

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
 * Heuristic phase split: when phases are present, treat high-priority tasks before the first non-high task
 * in topological order as "active phase" (phaseOrder=0), others as future phase (phaseOrder=1).
 */
function buildPhaseOrderByHeuristic(
  tasks: ParsedTask[],
  depOrder: number[],
  phases: SchedulerOptions['phases'] | null | undefined
): number[] {
  const phaseOrder = new Array(tasks.length).fill(1)
  const hasPhaseContext =
    phases != null &&
    Array.isArray(phases.phases) &&
    phases.phases.length > 0 &&
    typeof phases.active_phase_id === 'number' &&
    phases.active_phase_id >= 1 &&
    phases.active_phase_id <= phases.phases.length
  if (!hasPhaseContext) return phaseOrder

  const firstNonHighPos = depOrder.findIndex((taskIndex) => tasks[taskIndex].priority !== 'high')
  const activePrefixLength = firstNonHighPos === -1 ? depOrder.length : firstNonHighPos
  for (let pos = 0; pos < activePrefixLength; pos++) {
    const taskIndex = depOrder[pos]
    if (tasks[taskIndex].priority === 'high') phaseOrder[taskIndex] = 0
  }
  return phaseOrder
}

/**
 * Sort task indices: phase (active first), then dependency layer, then priority (high first), then energy_required (high first).
 * Session 4: harder and current-phase tasks earlier in the week while respecting dependencies.
 */
function sortIndicesByDependenciesThenPriorityAndEnergy(
  tasks: ParsedTask[],
  phases: SchedulerOptions['phases'] | null | undefined
): { sortedIndices: number[]; phaseOrder: number[] } {
  const depOrder = sortIndicesByDependencies(tasks)
  const n = tasks.length
  const depPosition = new Array(n).fill(0)
  depOrder.forEach((taskIndex, pos) => {
    depPosition[taskIndex] = pos
  })
  const phaseOrder = buildPhaseOrderByHeuristic(tasks, depOrder, phases)
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
  const sortedIndices = [...depOrder].sort((a, b) => {
    if (phaseOrder[a] !== phaseOrder[b]) return phaseOrder[a] - phaseOrder[b]
    if (layer[a] !== layer[b]) return layer[a] - layer[b]
    const pa = priorityOrder(tasks[a].priority)
    const pb = priorityOrder(tasks[b].priority)
    if (pa !== pb) return pa - pb
    const ea = energyOrder(tasks[a].energy_required)
    const eb = energyOrder(tasks[b].energy_required)
    if (ea !== eb) return ea - eb
    return depPosition[a] - depPosition[b]
  })
  return { sortedIndices, phaseOrder }
}

/** Slot type order for trying non-emergency first (Session 4). */
const SLOT_TYPE_ORDER: Record<SlotType, number> = {
  peak_energy: 0,
  normal: 1,
  flexible: 2,
  emergency: 3,
}

// ============================================
// Claude Scheduling Types
// ============================================

/**
 * Flattened task payload sent to Claude for structured slot assignment.
 */
interface ClaudeTaskInput {
  taskIndex: number
  title: string
  estimatedHours: number
  priority: ParsedTask['priority']
  energyRequired: ParsedTask['energy_required'] | null
  preferredSlotType: ParsedTask['preferred_slot'] | null
  dependsOn: number[]
  label: string | null
}

/**
 * Flattened slot payload sent to Claude (one entry per date + start time).
 */
interface ClaudeSlotInput {
  date: string
  day: string
  startTime: string
  endTime: string
  slotType: SlotType
  capacityHours: number
  isFlexible: boolean
  windowStart: string | null
  windowEnd: string | null
}

/**
 * Raw slot assignment shape expected from Claude output.
 */
interface ClaudeSlotOutput {
  date: string
  startTime: string
  endTime: string
  hoursAssigned: number
  partNumber: number
  isFlexible: boolean
  windowStart: string | null
  windowEnd: string | null
}

/**
 * Slot record enriched with computed datetimes and order for validation.
 */
interface SlotRecordForValidation extends ClaudeSlotInput {
  slotKey: string
  slotOrder: number
  slotStartDateTime: Date
  slotEndDateTime: Date
}

/**
 * Fully validated slot assignment that can be converted to ScheduleResult.
 */
interface ValidatedClaudeSlotAssignment extends ClaudeSlotOutput {
  slotKey: string
  slotType: SlotType
  slotStartDateTime: Date
  slotEndDateTime: Date
  assignmentStartDateTime: Date
  assignmentEndDateTime: Date
}

/**
 * Fully validated task assignment that can be converted to ScheduleResult.
 */
interface ValidatedClaudeTaskAssignment {
  taskIndex: number
  slots: ValidatedClaudeSlotAssignment[]
}

/**
 * Validation result for one Claude scheduling response.
 */
interface ClaudeValidationResult {
  isValid: boolean
  violations: string[]
  assignments: ValidatedClaudeTaskAssignment[]
}

/**
 * Type guard for record-like objects used while validating Claude JSON.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Build a stable slot identifier from local date + slot start time.
 */
function buildSlotKey(date: string, startTime: string): string {
  return `${date}|${startTime}`
}

/**
 * Parse "HH:MM" into hour/minute parts, returning null for invalid values.
 */
function parseTimeString(time: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

/**
 * Return YYYY-MM-DD + days, preserving calendar semantics.
 */
function addDaysToDateString(dateStr: string, days: number): string {
  const [yearStr, monthStr, dayStr] = dateStr.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if ([year, month, day].some((n) => Number.isNaN(n))) return dateStr
  const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
  utcDate.setUTCDate(utcDate.getUTCDate() + days)
  const y = utcDate.getUTCFullYear()
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, '0')
  const d = String(utcDate.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Build a UTC datetime from local date + local time in the user's timezone.
 */
function toUtcDateTimeFromLocal(dateStr: string, timeStr: string, userTimezone: string): Date | null {
  const parts = parseTimeString(timeStr)
  if (!parts) return null
  try {
    return localTimeInTimezoneToUTC(dateStr, parts.hour, parts.minute, userTimezone)
  } catch {
    return null
  }
}

/**
 * Build UTC start/end datetimes from local date and local HH:MM bounds.
 * End is treated as next day when it is <= start (overnight window).
 */
function toUtcDateRangeFromLocal(
  dateStr: string,
  startTime: string,
  endTime: string,
  userTimezone: string
): { start: Date; end: Date } | null {
  const start = toUtcDateTimeFromLocal(dateStr, startTime, userTimezone)
  if (!start) return null
  const startParts = parseTimeString(startTime)
  const endParts = parseTimeString(endTime)
  if (!startParts || !endParts) return null
  const crossesMidnight =
    endParts.hour < startParts.hour || (endParts.hour === startParts.hour && endParts.minute <= startParts.minute)
  const endDateStr = crossesMidnight ? addDaysToDateString(dateStr, 1) : dateStr
  const end = toUtcDateTimeFromLocal(endDateStr, endTime, userTimezone)
  if (!end) return null
  return { start, end }
}

/**
 * Normalize Claude text output into a parsable JSON array string.
 */
function extractJsonArrayText(rawText: string): string {
  let cleaned = rawText.trim()
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n')
    lines.shift()
    cleaned = lines.join('\n')
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3)
  }
  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')
  if (firstBracket === -1 || lastBracket === -1 || lastBracket < firstBracket) {
    throw new Error('Claude response did not contain a JSON array.')
  }
  return cleaned.slice(firstBracket, lastBracket + 1).trim()
}

/**
 * Convert UTC datetime to user-local "YYYY-MM-DD HH:MM" for readable validation errors.
 */
function formatDateTimeForViolation(dateTime: Date, userTimezone: string): string {
  const date = getLocalDateStrInTimezone(dateTime, userTimezone)
  const hours = getLocalHoursInTimezone(dateTime, userTimezone)
  return `${date} ${formatHoursToTime(hours)}`
}

/**
 * Build zero-based dependency lists from parsed 1-based depends_on references.
 */
function buildZeroBasedDependencies(tasks: ParsedTask[]): number[][] {
  return tasks.map((task, taskIndex) => {
    const deps = task.depends_on ?? []
    const zeroBased = deps
      .map((oneBased) => oneBased - 1)
      .filter((depIndex) => depIndex >= 0 && depIndex < tasks.length && depIndex !== taskIndex)
    return [...new Set(zeroBased)].sort((a, b) => a - b)
  })
}

/**
 * Convert task list into a compact JSON payload Claude can schedule semantically.
 */
function serializeTasksForClaude(tasks: ParsedTask[], zeroBasedDependencies: number[][]): ClaudeTaskInput[] {
  return tasks.map((task, taskIndex) => ({
    taskIndex,
    title: task.title,
    estimatedHours: task.hours,
    priority: task.priority,
    energyRequired: task.energy_required ?? null,
    preferredSlotType: task.preferred_slot ?? null,
    dependsOn: zeroBasedDependencies[taskIndex] ?? [],
    label: task.label ?? null,
  }))
}

/**
 * Flatten day-of-week slot map into chronological date-specific slots for the schedule window.
 */
function serializeSlotsForClaude(
  availability: Map<string, TimeSlot[]>,
  startDate: Date,
  durationWeeks: number,
  userTimezone: string
): SlotRecordForValidation[] {
  const totalDays = durationWeeks * 7
  const unsortedSlots: Array<SlotRecordForValidation & { startHoursSortable: number }> = []

  for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
    const currentDate = addDays(startDate, dayOffset)
    const date = getLocalDateStrInTimezone(currentDate, userTimezone)
    const day = getDayName(currentDate)
    const daySlots = availability.get(day) ?? []

    for (const slot of daySlots) {
      const startTime = formatHoursToTime(slot.startHours >= 24 ? slot.startHours % 24 : slot.startHours)
      const normalizedEndHours = slot.endHours >= 24 ? slot.endHours % 24 : slot.endHours
      const endTime = formatHoursToTime(normalizedEndHours)
      const slotType = slot.slotType ?? 'normal'
      const capacityHours = slot.flexibleHours ?? (slot.endHours - slot.startHours)
      const isFlexible = slot.flexibleHours != null
      const slotKey = buildSlotKey(date, startTime)
      const slotRange = toUtcDateRangeFromLocal(date, startTime, endTime, userTimezone)

      if (!slotRange) {
        // Invalid date/time data means this slot cannot be used reliably by Claude.
        continue
      }

      unsortedSlots.push({
        date,
        day,
        startTime,
        endTime,
        slotType,
        capacityHours,
        isFlexible,
        windowStart: slot.windowStart ?? null,
        windowEnd: slot.windowEnd ?? null,
        slotKey,
        slotOrder: -1,
        slotStartDateTime: slotRange.start,
        slotEndDateTime: slotRange.end,
        startHoursSortable: slot.startHours,
      })
    }
  }

  unsortedSlots.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.startHoursSortable - b.startHoursSortable
  })

  return unsortedSlots.map((slot, index) => {
    const { startHoursSortable, ...slotWithoutSortField } = slot
    void startHoursSortable
    return {
      ...slotWithoutSortField,
      slotOrder: index,
    }
  })
}

/**
 * Build Claude system prompt for semantic slot assignment using project context, tasks, and slots.
 */
function buildClaudeSchedulingSystemPrompt(
  projectContext: {
    projectGoals: string | null
    projectMotivation: string | null
    activePhaseId: number | null
    phases: Array<{
      id: number
      title: string | null
      goal: string | null
      deadline: string | null
      status: string | null
    }>
    userEnergyPeak: string | null
    userNotes: string[]
    projectNotes: string[]
    preferredSessionLengthMinutes: number | null
  },
  tasksForClaude: ClaudeTaskInput[],
  slotsForClaude: ClaudeSlotInput[]
): string {
  const outputExample = [
    {
      taskIndex: 0,
      slots: [
        {
          date: '2026-02-18',
          startTime: '20:00',
          endTime: '22:00',
          hoursAssigned: 2.0,
          partNumber: 1,
          isFlexible: false,
          windowStart: null,
          windowEnd: null,
        },
      ],
    },
  ]

  return `You are Harvey's scheduling engine. Build a task-to-slot assignment JSON only.

PROJECT CONTEXT (JSON):
${JSON.stringify(projectContext, null, 2)}

TASK LIST (JSON):
${JSON.stringify(tasksForClaude, null, 2)}

AVAILABLE SLOTS (JSON):
${JSON.stringify(slotsForClaude, null, 2)}

INSTRUCTIONS:
1. Assign every task to one or more slots from the available slots list. Use the exact slot identifiers provided (date + startTime).
2. Respect dependencies strictly: if task B depends on task A, every slot assigned to B must start after the latest end time of any slot assigned to A. No exceptions.
3. Prefer assigning tasks whole to a single slot where the slot has enough capacity. Only split across multiple consecutive slots if no single slot of sufficient size exists before the schedule deadline.
4. When splitting is unavoidable, parts must be assigned to consecutive slots. No other tasks can be scheduled between Part 1 and Part 2 of the same task.
5. Match slot types intelligently: high-energy tasks in peak_energy slots when possible; flexible/low-energy tasks in flexible or normal slots; avoid emergency slots for deep-focus tasks unless no other option exists.
6. Respect active phase ordering: schedule active-phase tasks before future-phase tasks whenever possible.
7. Do not modify task durations. Keep estimatedHours intact. If a task genuinely cannot fit in the schedule period, leave it unscheduled by omitting it or returning it with an empty slots array.
8. Return ONLY a valid JSON array, with no markdown, no preamble, and no explanation.

OUTPUT FORMAT (exact keys):
${JSON.stringify(outputExample, null, 2)}`
}

/**
 * Build retry user message that includes first-pass output and concrete validation violations.
 */
function buildClaudeRetryPrompt(firstResponse: string, violations: string[]): string {
  const violationLines = violations.map((violation, index) => `${index + 1}. ${violation}`).join('\n')
  return `Your previous JSON schedule violated hard constraints.

PREVIOUS RESPONSE:
${firstResponse}

VALIDATION ERRORS:
${violationLines}

Use the same task and slot context from the system prompt. Fix only these violations and return the full corrected JSON array. Output JSON only.`
}

/**
 * Ask Claude Haiku for slot assignments and return raw text response.
 * @param userId - Optional; if provided, usage is logged for cost tracking
 */
async function requestClaudeSchedulingAssignments(
  systemPrompt: string,
  userPrompt: string,
  userId?: string
): Promise<string> {
  const response = await withAnthropicRetry(() =>
    anthropic.messages.create({
      model: CLAUDE_SCHEDULER_MODEL,
      max_tokens: CLAUDE_SCHEDULER_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
  )

  if (userId) {
    logApiUsage({
      userId,
      feature: 'task_scheduler',
      model: CLAUDE_SCHEDULER_MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }).catch(() => {})
  }

  const textBlock = response.content.find((block) => block.type === 'text')
  const text = textBlock?.type === 'text' ? textBlock.text.trim() : ''
  if (!text) {
    throw new Error('Claude returned an empty scheduling response.')
  }
  return text
}

/**
 * Validate Claude's JSON schedule against hard constraints before DB writes.
 */
function validateClaudeAssignments(
  rawAssignments: unknown,
  tasks: ParsedTask[],
  dependencyMap: number[][],
  slotLookup: Map<string, SlotRecordForValidation>,
  slotOrderLookup: Map<string, number>,
  userTimezone: string
): ClaudeValidationResult {
  const violations: string[] = []
  const assignments: ValidatedClaudeTaskAssignment[] = []
  // Task totals are validated with a looser tolerance to absorb floating-point math (e.g. 1.3333h style outputs).
  const TASK_DURATION_TOLERANCE_HOURS = 0.1

  if (!Array.isArray(rawAssignments)) {
    return {
      isValid: false,
      violations: ['Claude output is not a JSON array.'],
      assignments: [],
    }
  }

  const seenTaskIndices = new Set<number>()

  for (const [assignmentIndex, rawAssignment] of rawAssignments.entries()) {
    if (!isRecord(rawAssignment)) {
      violations.push(`Assignment ${assignmentIndex + 1} is not an object.`)
      continue
    }

    const taskIndexRaw = rawAssignment.taskIndex
    const taskIndex = typeof taskIndexRaw === 'number' ? taskIndexRaw : null
    if (taskIndex == null || !Number.isInteger(taskIndex) || taskIndex < 0 || taskIndex >= tasks.length) {
      violations.push(`Assignment ${assignmentIndex + 1} has invalid taskIndex ${String(taskIndexRaw)}.`)
      continue
    }

    if (seenTaskIndices.has(taskIndex)) {
      violations.push(`Task ${taskIndex} appears multiple times in Claude output.`)
      continue
    }
    seenTaskIndices.add(taskIndex)

    const rawSlots = rawAssignment.slots
    if (!Array.isArray(rawSlots)) {
      violations.push(`Task ${taskIndex} has invalid "slots" (expected array).`)
      continue
    }

    const validatedSlots: ValidatedClaudeSlotAssignment[] = []

    for (const [slotIndex, rawSlot] of rawSlots.entries()) {
      if (!isRecord(rawSlot)) {
        violations.push(`Task ${taskIndex} slot ${slotIndex + 1} is not an object.`)
        continue
      }

      const date = typeof rawSlot.date === 'string' ? rawSlot.date : null
      const startTime = typeof rawSlot.startTime === 'string' ? rawSlot.startTime : null
      const endTime = typeof rawSlot.endTime === 'string' ? rawSlot.endTime : null
      const hoursAssigned = typeof rawSlot.hoursAssigned === 'number' ? rawSlot.hoursAssigned : null
      const partNumber = typeof rawSlot.partNumber === 'number' ? rawSlot.partNumber : null
      const isFlexible = typeof rawSlot.isFlexible === 'boolean' ? rawSlot.isFlexible : null
      const windowStart =
        rawSlot.windowStart == null || typeof rawSlot.windowStart === 'string' ? (rawSlot.windowStart as string | null) : null
      const windowEnd =
        rawSlot.windowEnd == null || typeof rawSlot.windowEnd === 'string' ? (rawSlot.windowEnd as string | null) : null

      if (!date || !startTime || !endTime) {
        violations.push(`Task ${taskIndex} slot ${slotIndex + 1} is missing date/startTime/endTime.`)
        continue
      }
      if (hoursAssigned == null || !Number.isFinite(hoursAssigned) || hoursAssigned <= 0) {
        violations.push(`Task ${taskIndex} slot ${slotIndex + 1} has invalid hoursAssigned.`)
        continue
      }
      if (partNumber == null || !Number.isInteger(partNumber) || partNumber < 1) {
        violations.push(`Task ${taskIndex} slot ${slotIndex + 1} has invalid partNumber.`)
        continue
      }
      if (isFlexible == null) {
        violations.push(`Task ${taskIndex} slot ${slotIndex + 1} has invalid isFlexible.`)
        continue
      }

      const slotKey = buildSlotKey(date, startTime)
      const slotRecord = slotLookup.get(slotKey)
      if (!slotRecord) {
        violations.push(`Task ${taskIndex} references unknown slot ${date} ${startTime}.`)
        continue
      }

      const assignmentRange = toUtcDateRangeFromLocal(date, startTime, endTime, userTimezone)
      if (!assignmentRange) {
        violations.push(`Task ${taskIndex} slot ${date} ${startTime} has invalid start/end times.`)
        continue
      }

      // Partial slot usage is valid: hoursAssigned is the claimed task effort, not required to equal the slot's full range.
      // Real duration integrity is enforced below by summing hoursAssigned across all slots of the same task.

      if (assignmentRange.start.getTime() < slotRecord.slotStartDateTime.getTime()) {
        violations.push(`Task ${taskIndex} starts before slot boundary at ${date} ${startTime}.`)
      }
      if (assignmentRange.end.getTime() > slotRecord.slotEndDateTime.getTime()) {
        violations.push(
          `Task ${taskIndex} ends after slot boundary at ${date} ${slotRecord.endTime} (attempted end ${endTime}).`
        )
      }
      if (hoursAssigned - slotRecord.capacityHours > HOURS_EPSILON) {
        violations.push(
          `Task ${taskIndex} assigns ${hoursAssigned}h in slot ${date} ${startTime} with capacity ${slotRecord.capacityHours}h.`
        )
      }

      if (slotRecord.isFlexible !== isFlexible) {
        violations.push(`Task ${taskIndex} slot ${date} ${startTime} has incorrect isFlexible value.`)
      }
      if (slotRecord.isFlexible) {
        if (windowStart !== slotRecord.windowStart || windowEnd !== slotRecord.windowEnd) {
          violations.push(
            `Task ${taskIndex} flexible slot ${date} ${startTime} must use window ${slotRecord.windowStart}-${slotRecord.windowEnd}.`
          )
        }
      } else if (windowStart !== null || windowEnd !== null) {
        violations.push(`Task ${taskIndex} fixed slot ${date} ${startTime} must set windowStart/windowEnd to null.`)
      }

      validatedSlots.push({
        date,
        startTime,
        endTime,
        hoursAssigned,
        partNumber,
        isFlexible,
        windowStart,
        windowEnd,
        slotKey,
        slotType: slotRecord.slotType,
        slotStartDateTime: slotRecord.slotStartDateTime,
        slotEndDateTime: slotRecord.slotEndDateTime,
        assignmentStartDateTime: assignmentRange.start,
        assignmentEndDateTime: assignmentRange.end,
      })
    }

    // Enforce sequential part numbering so split tasks are deterministic and easy to validate.
    validatedSlots.sort((a, b) => a.partNumber - b.partNumber)
    for (let i = 0; i < validatedSlots.length; i++) {
      if (validatedSlots[i].partNumber !== i + 1) {
        violations.push(`Task ${taskIndex} part numbers must be contiguous starting at 1.`)
        break
      }
    }

    // Enforce "split parts in consecutive slots" by requiring adjacent slot-order indices.
    if (validatedSlots.length > 1) {
      for (let i = 1; i < validatedSlots.length; i++) {
        const previous = validatedSlots[i - 1]
        const current = validatedSlots[i]
        const previousOrder = slotOrderLookup.get(previous.slotKey)
        const currentOrder = slotOrderLookup.get(current.slotKey)
        if (previousOrder == null || currentOrder == null || currentOrder !== previousOrder + 1) {
          violations.push(
            `Task ${taskIndex} split parts must use consecutive slots; found non-consecutive parts ${previous.partNumber} and ${current.partNumber}.`
          )
          break
        }
      }
    }

    // Task-level duration integrity: total claimed hours across all parts must match the task estimate.
    const totalAssignedHours = validatedSlots.reduce((sum, slot) => sum + slot.hoursAssigned, 0)
    if (
      validatedSlots.length > 0 &&
      Math.abs(totalAssignedHours - tasks[taskIndex].hours) > TASK_DURATION_TOLERANCE_HOURS
    ) {
      violations.push(
        `Task ${taskIndex} duration mismatch: expected ${tasks[taskIndex].hours}h, assigned ${totalAssignedHours.toFixed(2)}h (tolerance ±${TASK_DURATION_TOLERANCE_HOURS}h).`
      )
    }

    assignments.push({
      taskIndex,
      slots: validatedSlots,
    })
  }

  // Prevent two tasks from occupying the same identified slot.
  const slotOccupancy = new Map<string, number>()
  for (const assignment of assignments) {
    for (const slot of assignment.slots) {
      const existingTaskIndex = slotOccupancy.get(slot.slotKey)
      if (existingTaskIndex != null && existingTaskIndex !== assignment.taskIndex) {
        violations.push(
          `Slot conflict at ${slot.date} ${slot.startTime}: task ${assignment.taskIndex} overlaps task ${existingTaskIndex}.`
        )
      } else {
        slotOccupancy.set(slot.slotKey, assignment.taskIndex)
      }
    }
  }

  // Generic overlap check catches accidental interval overlaps even if slot IDs differ.
  const allIntervals = assignments.flatMap((assignment) =>
    assignment.slots.map((slot) => ({
      taskIndex: assignment.taskIndex,
      start: slot.assignmentStartDateTime,
      end: slot.assignmentEndDateTime,
      date: slot.date,
      startTime: slot.startTime,
    }))
  )
  allIntervals.sort((a, b) => a.start.getTime() - b.start.getTime())
  for (let i = 0; i < allIntervals.length; i++) {
    for (let j = i + 1; j < allIntervals.length; j++) {
      const left = allIntervals[i]
      const right = allIntervals[j]
      if (right.start.getTime() >= left.end.getTime()) break
      const overlaps = left.start.getTime() < right.end.getTime() && right.start.getTime() < left.end.getTime()
      if (overlaps) {
        violations.push(
          `Overlap detected: task ${left.taskIndex} (${left.date} ${left.startTime}) conflicts with task ${right.taskIndex} (${right.date} ${right.startTime}).`
        )
      }
    }
  }

  // Dependency validation: each task must start strictly after every dependency ends.
  const scheduleBoundsByTask = new Map<number, { earliestStart: Date; latestEnd: Date }>()
  for (const assignment of assignments) {
    if (assignment.slots.length === 0) continue
    const earliestStart = assignment.slots.reduce((earliest, slot) =>
      slot.assignmentStartDateTime.getTime() < earliest.getTime() ? slot.assignmentStartDateTime : earliest
    , assignment.slots[0].assignmentStartDateTime)
    const latestEnd = assignment.slots.reduce((latest, slot) =>
      slot.assignmentEndDateTime.getTime() > latest.getTime() ? slot.assignmentEndDateTime : latest
    , assignment.slots[0].assignmentEndDateTime)
    scheduleBoundsByTask.set(assignment.taskIndex, { earliestStart, latestEnd })
  }

  for (const assignment of assignments) {
    const currentBounds = scheduleBoundsByTask.get(assignment.taskIndex)
    if (!currentBounds) continue
    const dependencies = dependencyMap[assignment.taskIndex] ?? []
    for (const dependencyIndex of dependencies) {
      const dependencyBounds = scheduleBoundsByTask.get(dependencyIndex)
      if (!dependencyBounds) {
        violations.push(`Task ${assignment.taskIndex} is scheduled but dependency task ${dependencyIndex} is unscheduled.`)
        continue
      }
      if (currentBounds.earliestStart.getTime() <= dependencyBounds.latestEnd.getTime()) {
        violations.push(
          `Task ${assignment.taskIndex} starts at ${formatDateTimeForViolation(currentBounds.earliestStart, userTimezone)} but dependency task ${dependencyIndex} ends at ${formatDateTimeForViolation(dependencyBounds.latestEnd, userTimezone)}.`
        )
      }
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
    assignments,
  }
}

/**
 * Parse Claude JSON text and run hard-constraint validation.
 */
function parseAndValidateClaudeAssignments(
  responseText: string,
  tasks: ParsedTask[],
  dependencyMap: number[][],
  slotLookup: Map<string, SlotRecordForValidation>,
  slotOrderLookup: Map<string, number>,
  userTimezone: string
): ClaudeValidationResult {
  try {
    const jsonText = extractJsonArrayText(responseText)
    const parsed = JSON.parse(jsonText) as unknown
    return validateClaudeAssignments(parsed, tasks, dependencyMap, slotLookup, slotOrderLookup, userTimezone)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error'
    return {
      isValid: false,
      violations: [`Failed to parse Claude JSON response: ${message}`],
      assignments: [],
    }
  }
}

/**
 * Build Date object for scheduledDate using UTC noon to preserve calendar day across timezones.
 */
function toUtcNoonDate(dateStr: string): Date {
  const [yearStr, monthStr, dayStr] = dateStr.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if ([year, month, day].some((n) => Number.isNaN(n))) {
    return new Date()
  }
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
}

/**
 * Convert validated Claude assignments into the existing ScheduleResult contract.
 */
function buildScheduleResultFromClaudeAssignments(
  tasks: ParsedTask[],
  validatedAssignments: ValidatedClaudeTaskAssignment[],
  slotLookup: Map<string, SlotRecordForValidation>
): ScheduleResult {
  const scheduledTasks: ScheduledTaskAssignment[] = []
  let totalHoursScheduled = 0
  let weekendHoursUsed = 0

  const assignmentByTaskIndex = new Map<number, ValidatedClaudeTaskAssignment>()
  for (const assignment of validatedAssignments) {
    assignmentByTaskIndex.set(assignment.taskIndex, assignment)
  }

  for (const assignment of validatedAssignments) {
    const task = tasks[assignment.taskIndex]
    const isSplit = assignment.slots.length > 1
    for (const slot of assignment.slots) {
      const slotRecord = slotLookup.get(slot.slotKey)
      const fallbackTimeBlock = `${slot.startTime}-${slot.endTime}`
      const flexibleWindowStart = slot.windowStart ?? slotRecord?.windowStart ?? undefined
      const flexibleWindowEnd = slot.windowEnd ?? slotRecord?.windowEnd ?? undefined
      const timeBlock = slot.isFlexible
        ? `${flexibleWindowStart ?? slot.startTime}-${flexibleWindowEnd ?? slot.endTime}`
        : fallbackTimeBlock

      scheduledTasks.push({
        taskIndex: assignment.taskIndex,
        task,
        date: toUtcNoonDate(slot.date),
        startTime: slot.assignmentStartDateTime,
        endTime: slot.assignmentEndDateTime,
        timeBlock,
        partNumber: isSplit ? slot.partNumber : undefined,
        hoursAssigned: slot.hoursAssigned,
        ...(slot.isFlexible && {
          isFlexible: true,
          windowStart: flexibleWindowStart,
          windowEnd: flexibleWindowEnd,
        }),
        slotType: slot.slotType,
      })

      totalHoursScheduled += slot.hoursAssigned
      const slotDay = slotRecord?.day ?? ''
      if (slotDay === 'saturday' || slotDay === 'sunday') {
        weekendHoursUsed += slot.hoursAssigned
      }
    }
  }

  const unscheduledTaskIndices: number[] = []
  let totalHoursUnscheduled = 0
  for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
    const assignment = assignmentByTaskIndex.get(taskIndex)
    if (!assignment || assignment.slots.length === 0) {
      unscheduledTaskIndices.push(taskIndex)
      totalHoursUnscheduled += tasks[taskIndex].hours
    }
  }

  let weekendHoursAvailable = 0
  for (const slot of slotLookup.values()) {
    if (slot.day === 'saturday' || slot.day === 'sunday') {
      weekendHoursAvailable += slot.capacityHours
    }
  }

  scheduledTasks.sort((a, b) => {
    const dateCompare = a.date.getTime() - b.date.getTime()
    if (dateCompare !== 0) return dateCompare
    return a.startTime.getTime() - b.startTime.getTime()
  })

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
 * Assign tasks with Claude semantic scheduling, then enforce hard constraints locally.
 * Falls back to deterministic assignTasksToSchedule if Claude fails validation twice.
 */
export async function assignTasksWithClaude(
  tasks: ParsedTask[],
  constraints: ExtractedConstraints,
  startDate: Date,
  durationWeeks: number,
  userTimezone: string = 'UTC',
  userBlocked?: UserBlockedInput | null,
  options?: SchedulerOptions | null,
  userId?: string
): Promise<ScheduleResult> {
  const energyPeak = options?.energyPeak ?? constraints.energy_peak ?? null
  const availability = buildAvailabilityMap(constraints, userBlocked, energyPeak)
  const dependencyMap = buildZeroBasedDependencies(tasks)
  const tasksForClaude = serializeTasksForClaude(tasks, dependencyMap)
  const serializedSlotRecords = serializeSlotsForClaude(availability, startDate, durationWeeks, userTimezone)

  const slotLookup = new Map<string, SlotRecordForValidation>()
  const slotOrderLookup = new Map<string, number>()
  for (const slot of serializedSlotRecords) {
    if (slotLookup.has(slot.slotKey)) {
      console.warn(`[TaskScheduler] ClaudeScheduler: duplicate slot key ${slot.slotKey}; keeping first occurrence.`)
      continue
    }
    slotLookup.set(slot.slotKey, slot)
    slotOrderLookup.set(slot.slotKey, slot.slotOrder)
  }

  const slotsForClaude: ClaudeSlotInput[] = [...slotLookup.values()]
    .sort((a, b) => a.slotOrder - b.slotOrder)
    .map((slot) => ({
    date: slot.date,
    day: slot.day,
    startTime: slot.startTime,
    endTime: slot.endTime,
    slotType: slot.slotType,
    capacityHours: slot.capacityHours,
    isFlexible: slot.isFlexible,
    windowStart: slot.windowStart,
    windowEnd: slot.windowEnd,
    }))

  const phaseContextRaw = options?.phases?.phases ?? []
  const projectContext = {
    projectGoals: options?.projectGoals ?? null,
    projectMotivation: options?.projectMotivation ?? null,
    activePhaseId: options?.phases?.active_phase_id ?? null,
    phases: phaseContextRaw.map((phase, index) => {
      const phaseRecord = phase as Record<string, unknown>
      const id = typeof phaseRecord.id === 'number' ? phaseRecord.id : index + 1
      const title = typeof phaseRecord.title === 'string' ? phaseRecord.title : null
      const goal = typeof phaseRecord.goal === 'string' ? phaseRecord.goal : null
      const deadline = typeof phaseRecord.deadline === 'string' ? phaseRecord.deadline : null
      const status = typeof phaseRecord.status === 'string' ? phaseRecord.status : null
      return { id, title, goal, deadline, status }
    }),
    userEnergyPeak: energyPeak,
    userNotes: (options?.userNotes ?? []).map((note) => note.note).filter((note) => Boolean(note)),
    projectNotes: (options?.projectNotes ?? []).map((note) => note.note).filter((note) => Boolean(note)),
    preferredSessionLengthMinutes: options?.preferredSessionLength ?? null,
  }

  const systemPrompt = buildClaudeSchedulingSystemPrompt(projectContext, tasksForClaude, slotsForClaude)
  const defaultUserPrompt = 'Generate the schedule now. Return only the JSON array.'

  let lastViolations: string[] = []
  let previousResponse = ''

  for (let attempt = 1; attempt <= CLAUDE_SCHEDULER_MAX_ATTEMPTS; attempt++) {
    const userPrompt =
      attempt === 1 ? defaultUserPrompt : buildClaudeRetryPrompt(previousResponse, lastViolations)

    try {
      const responseText = await requestClaudeSchedulingAssignments(systemPrompt, userPrompt, userId)
      previousResponse = responseText
      const validation = parseAndValidateClaudeAssignments(
        responseText,
        tasks,
        dependencyMap,
        slotLookup,
        slotOrderLookup,
        userTimezone
      )

      if (validation.isValid) {
        const result = buildScheduleResultFromClaudeAssignments(tasks, validation.assignments, slotLookup)
        console.log(
          `[TaskScheduler] ClaudeScheduler: success on attempt ${attempt}. scheduled_blocks=${result.scheduledTasks.length}, unscheduled_tasks=${result.unscheduledTaskIndices.length}`
        )
        return result
      }

      lastViolations = validation.violations
      console.warn(
        `[TaskScheduler] ClaudeScheduler: validation failed on attempt ${attempt}. Violations:\n${lastViolations.join('\n')}`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Claude scheduling error'
      lastViolations = [`Claude scheduling request failed: ${message}`]
      console.warn(`[TaskScheduler] ClaudeScheduler: request failed on attempt ${attempt}: ${message}`)
    }
  }

  // Second failure falls back to deterministic scheduler to keep generation resilient.
  console.warn(
    `[TaskScheduler] ClaudeScheduler: fallback to deterministic scheduler after ${CLAUDE_SCHEDULER_MAX_ATTEMPTS} failed attempt(s). Violations:\n${lastViolations.join('\n')}`
  )
  return assignTasksToSchedule(tasks, constraints, startDate, durationWeeks, userTimezone, userBlocked, options)
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
  const phases = options?.phases ?? null

  console.log(
    `[TaskScheduler] Starting scheduling: ${tasks.length} tasks, ${durationWeeks} weeks, starting ${startDate.toISOString().split('T')[0]}`
  )

  const scheduledTasks: ScheduledTaskAssignment[] = []
  let totalHoursScheduled = 0

  /** When a task is split, Part N+1 can only be placed in slots starting after Part N ends (same day or later). */
  const earliestStartForContinuation = new Map<number, Date>()

  // Build availability map with slot types (Session 4)
  const availability = buildAvailabilityMap(constraints, userBlocked, energyPeak)

  // Session 4: order by phase, dependency, then within layer by priority (high first), then energy_required (high first)
  const { sortedIndices: sortedTaskIndices, phaseOrder } = sortIndicesByDependenciesThenPriorityAndEnergy(tasks, phases)
  const sortedTaskPosition = new Map<number, number>()
  sortedTaskIndices.forEach((taskIndex, pos) => {
    sortedTaskPosition.set(taskIndex, pos)
  })

  if (phases?.phases?.length) {
    const activeCount = phaseOrder.filter((v) => v === 0).length
    console.log(
      `[TaskScheduler] PhaseOrder: active_phase_id=${phases.active_phase_id} heuristic_active_tasks=${activeCount}/${tasks.length}`
    )
  }

  // Log task sort order with phase, energy_required, priority, preferred_slot
  sortedTaskIndices.forEach((taskIndex, orderPos) => {
    const t = tasks[taskIndex]
    const phaseLabel = phaseOrder[taskIndex] === 0 ? 'active' : 'future'
    console.log(
      `[TaskScheduler] TaskOrder: #${orderPos + 1} "${t.title}" phase=${phaseLabel} energy=${t.energy_required ?? '—'} priority=${t.priority} preferred=${t.preferred_slot ?? '—'}`
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

  /** Cross-day dependency ordering — every dependency must already be scheduled and fully finished before this slot starts. */
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
      if (depIndex < 0 || depIndex >= tasks.length || depIndex === taskIndex) continue
      const depAssignments = assignedSoFar.filter((s) => s.taskIndex === depIndex)
      if (depAssignments.length === 0) return false
      const depStillRemaining = remainingTasks.some((r) => r.taskIndex === depIndex && r.remainingHours > 0)
      if (depStillRemaining) return false
      const depLatestEndMs = Math.max(...depAssignments.map((a) => a.endTime.getTime()))
      if (slotStartMs <= depLatestEndMs) return false
    }
    return true
  }

  /** Continuation priority: if a split task already has Part 1+ scheduled and it's eligible now, it must be picked before any new task. */
  function pickContinuationTaskForSlot(
    currentDate: Date,
    slotStartHours: number,
    remaining: RemainingTask[],
    assignedSoFar: ScheduledTaskAssignment[]
  ): RemainingTask | null {
    const slotStartTime = createDateTimeInTimezone(currentDate, slotStartHours, userTimezone)
    const continuationCandidates = remaining
      .filter((r) => {
        const hasScheduledPart = assignedSoFar.some(
          (s) => s.taskIndex === r.taskIndex && s.partNumber != null
        )
        if (!hasScheduledPart) return false
        const earliest = earliestStartForContinuation.get(r.taskIndex)
        if (!earliest) return false
        if (slotStartTime.getTime() < earliest.getTime()) return false
        return canPlaceTaskInSlot(r.taskIndex, currentDate, slotStartHours, assignedSoFar)
      })
      .sort((a, b) => {
        const aStart = earliestStartForContinuation.get(a.taskIndex)?.getTime() ?? Number.MAX_SAFE_INTEGER
        const bStart = earliestStartForContinuation.get(b.taskIndex)?.getTime() ?? Number.MAX_SAFE_INTEGER
        if (aStart !== bStart) return aStart - bStart
        const aPos = sortedTaskPosition.get(a.taskIndex) ?? Number.MAX_SAFE_INTEGER
        const bPos = sortedTaskPosition.get(b.taskIndex) ?? Number.MAX_SAFE_INTEGER
        return aPos - bPos
      })

    return continuationCandidates[0] ?? null
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

          const slotStartTime = createDateTimeInTimezone(currentDate, currentSlotStartHours, userTimezone)
          const continuationTask = pickContinuationTaskForSlot(
            currentDate,
            currentSlotStartHours,
            remainingTasks,
            scheduledTasks
          )

          let chosen: RemainingTask | null = continuationTask
          if (continuationTask) {
            const earliest = earliestStartForContinuation.get(continuationTask.taskIndex)
            console.log(
              `[TaskScheduler] ContinuationPriority: task="${continuationTask.task.title}" earliest=${earliest?.toISOString() ?? '—'} slot_start=${slotStartTime.toISOString()}`
            )
          } else {
            chosen = pickTaskForSlot(slot.slotType, dayNum, remainingTasks)
            // Dependency/continuation eligibility — skip invalid candidates (cap iterations to avoid any hang)
            let tries = 0
            const maxTries = Math.max(remainingTasks.length, 1)
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
          }
          // Guard: verify the final chosen actually passed dependency check.
          // The while loop may have exited due to maxTries exhaustion, leaving
          // chosen as the last unchecked candidate.
          if (
            !chosen ||
            !canPlaceTaskInSlot(chosen.taskIndex, currentDate, currentSlotStartHours, scheduledTasks)
          ) {
            console.log(
              `[TaskScheduler] SlotSkipped: no valid task passed dependency check for slot ` +
                `${currentDate.toISOString().slice(0, 10)} ${currentSlotStartHours}h — skipping slot`
            )
            break
          }
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
