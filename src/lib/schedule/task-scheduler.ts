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
}

/**
 * Internal representation of an available time slot.
 * When flexibleHours is set, slot capacity = flexibleHours (boundary in windowStart/windowEnd).
 */
interface TimeSlot {
  day: string // monday, tuesday, etc.
  startHours: number // decimal hours (9.5 = 9:30 AM)
  endHours: number // decimal hours
  label?: string
  flexibleHours?: number // when set, capacity = this; task gets is_flexible and window bounds
  windowStart?: string // boundary start e.g. '09:00'
  windowEnd?: string // boundary end e.g. '17:30'
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
 *
 * @param constraints - Extracted constraints (available_time from Project.contextData)
 * @param userBlocked - Optional User life constraints; blocked time is derived from these
 * @returns Map of day → array of time slots (free to schedule)
 */
function buildAvailabilityMap(
  constraints: ExtractedConstraints,
  userBlocked?: UserBlockedInput | null
): Map<string, TimeSlot[]> {
  const availability = new Map<string, TimeSlot[]>()
  const blocks = constraints.available_time || []
  const fixedBlocks = blocks.filter((b) => !(typeof (b as { flexible_hours?: number }).flexible_hours === 'number' && (b as { flexible_hours: number }).flexible_hours > 0))
  const flexibleBlocks = blocks.filter((b) => typeof (b as { flexible_hours?: number }).flexible_hours === 'number' && (b as { flexible_hours: number }).flexible_hours > 0)

  // Fixed blocks: add then subtract User work/commute
  for (const block of fixedBlocks) {
    const day = block.day.toLowerCase()
    const startHours = parseTimeToHours(block.start)
    const endHours = parseTimeToHours(block.end)

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
      })
    } else {
      availability.get(day)!.push({
        day,
        startHours: startHours,
        endHours: endHours,
        label: block.label,
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

  // Flexible blocks: add with capacity = flexible_hours; do not subtract (capacity is already the available amount within boundary)
  for (const block of flexibleBlocks) {
    const b = block as { day: string; start: string; end: string; flexible_hours: number; label?: string }
    const day = b.day.toLowerCase()
    const startHours = parseTimeToHours(b.start)
    const flexHours = b.flexible_hours
    const endHours = startHours + flexHours

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
    })
  }

  for (const [day, slots] of availability) {
    slots.sort((a, b) => a.startHours - b.startHours)
    availability.set(day, slots)
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

// ============================================
// Main Scheduling Function
// ============================================

/**
 * Assign tasks to specific dates and time slots based on available time
 *
 * This is the main scheduling algorithm, adapted from the Telegram bot.
 * Respects task dependencies: tasks with depends_on are scheduled after their dependencies.
 * When userTimezone is provided, slot times (e.g. 9–17) are interpreted in that zone and stored as UTC.
 * Blocked time (work, commute) is derived from userBlocked (User.workSchedule, User.commute) and subtracted from available_time.
 *
 * @param tasks - Array of parsed tasks with hours and priority
 * @param constraints - Project constraints (available_time from contextData)
 * @param startDate - When to start scheduling
 * @param durationWeeks - How many weeks to schedule
 * @param userTimezone - User's IANA timezone (e.g. Europe/Paris) so times are stored in UTC
 * @param userBlocked - Optional User life constraints (workSchedule, commute); blocked time is subtracted from available slots
 * @returns Schedule result with assigned tasks
 */
export function assignTasksToSchedule(
  tasks: ParsedTask[],
  constraints: ExtractedConstraints,
  startDate: Date,
  durationWeeks: number,
  userTimezone: string = 'UTC',
  userBlocked?: UserBlockedInput | null
): ScheduleResult {
  console.log(
    `[TaskScheduler] Starting scheduling: ${tasks.length} tasks, ${durationWeeks} weeks, starting ${startDate.toISOString().split('T')[0]}`
  )

  const scheduledTasks: ScheduledTaskAssignment[] = []
  let totalHoursScheduled = 0

  // Build availability map from available_time, subtracting User work/commute
  const availability = buildAvailabilityMap(constraints, userBlocked)

  console.log('[TaskScheduler] Availability map:')
  for (const [day, slots] of availability) {
    console.log(
      `  ${day}: ${slots.map((s) => `${formatHoursToTime(s.startHours)}-${formatHoursToTime(s.endHours)}`).join(', ')}`
    )
  }

  // CRITICAL: We do NOT sort by priority after topological sort because:
  // 1. Dependencies are more important than priority
  // 2. Re-sorting breaks the dependency chain (high-priority dependent task could move before its dependency)
  // 3. Claude already orders tasks by importance in the generation prompt
  // If we want priority sorting, it must be done WITHIN each dependency layer (not globally)
  const sortedTaskIndices = sortIndicesByDependencies(tasks)

  // Create remaining tasks queue
  const remainingTasks: RemainingTask[] = sortedTaskIndices.map((taskIndex) => ({
    taskIndex,
    task: tasks[taskIndex],
    remainingHours: tasks[taskIndex].hours,
    partNumber: 1,
  }))

  // Calculate total days to schedule
  const totalDays = durationWeeks * 7

  console.log(`[TaskScheduler] Scheduling ${remainingTasks.length} tasks over ${totalDays} days`)

  // Schedule day by day
  for (let dayNum = 0; dayNum < totalDays; dayNum++) {
    if (remainingTasks.length === 0) {
      console.log(`[TaskScheduler] All tasks scheduled by day ${dayNum + 1}`)
      break
    }

    const currentDate = addDays(startDate, dayNum)
    const dayName = getDayName(currentDate)

    // Get available slots for this day of week
    const daySlots = availability.get(dayName) || []

    if (daySlots.length === 0) {
      continue // No availability on this day
    }

    // Assign tasks to available slots
    for (const slot of daySlots) {
      if (remainingTasks.length === 0) break

      const slotDuration = slot.flexibleHours ?? (slot.endHours - slot.startHours)

      if (slotDuration <= 0) continue

      let slotFilled = 0
      let currentSlotStartHours = slot.startHours
      const isFlexibleSlot = slot.flexibleHours != null

      // Fill this slot with tasks
      while (slotFilled < slotDuration && remainingTasks.length > 0) {
        const task = remainingTasks[0]
        const remainingSlotTime = slotDuration - slotFilled

        // Minimum work block is 30 minutes (0.5 hours)
        if (remainingSlotTime < 0.5) break

        if (task.remainingHours <= remainingSlotTime) {
          // Task fits completely in remaining slot time
          const taskEndHours = currentSlotStartHours + task.remainingHours

          scheduledTasks.push({
            taskIndex: task.taskIndex,
            task: task.task,
            date: new Date(currentDate),
            startTime: createDateTimeInTimezone(currentDate, currentSlotStartHours, userTimezone),
            endTime: createDateTimeInTimezone(currentDate, taskEndHours, userTimezone),
            timeBlock: isFlexibleSlot
              ? `${slot.windowStart ?? formatHoursToTime(slot.startHours)}-${slot.windowEnd ?? formatHoursToTime(slot.endHours)}`
              : `${formatHoursToTime(currentSlotStartHours)}-${formatHoursToTime(taskEndHours)}`,
            partNumber: task.partNumber > 1 ? task.partNumber : undefined,
            hoursAssigned: task.remainingHours,
            ...(isFlexibleSlot && {
              isFlexible: true,
              windowStart: slot.windowStart,
              windowEnd: slot.windowEnd,
            }),
          })

          totalHoursScheduled += task.remainingHours
          slotFilled += task.remainingHours
          currentSlotStartHours = taskEndHours

          // Remove task from queue
          remainingTasks.shift()
        } else {
          // Task doesn't fit - split it if we have at least 1 hour remaining
          if (remainingSlotTime >= 1.0) {
            const hoursThisSlot = remainingSlotTime
            const taskEndHours = currentSlotStartHours + hoursThisSlot

            scheduledTasks.push({
              taskIndex: task.taskIndex,
              task: task.task,
              date: new Date(currentDate),
              startTime: createDateTimeInTimezone(currentDate, currentSlotStartHours, userTimezone),
              endTime: createDateTimeInTimezone(currentDate, taskEndHours, userTimezone),
              timeBlock: isFlexibleSlot
                ? `${slot.windowStart ?? formatHoursToTime(slot.startHours)}-${slot.windowEnd ?? formatHoursToTime(slot.endHours)}`
                : `${formatHoursToTime(currentSlotStartHours)}-${formatHoursToTime(taskEndHours)}`,
              partNumber: task.partNumber,
              hoursAssigned: hoursThisSlot,
              ...(isFlexibleSlot && {
                isFlexible: true,
                windowStart: slot.windowStart,
                windowEnd: slot.windowEnd,
              }),
            })

            totalHoursScheduled += hoursThisSlot

            // Update remaining task for next slot
            task.remainingHours -= hoursThisSlot
            task.partNumber += 1
          }

          // Slot is full, move to next slot
          break
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

  console.log(`[TaskScheduler] Scheduling complete:`)
  console.log(`  - Scheduled: ${scheduledTasks.length} task blocks (${totalHoursScheduled.toFixed(1)} hours)`)
  console.log(`  - Unscheduled: ${unscheduledTaskIndices.length} tasks (${totalHoursUnscheduled.toFixed(1)} hours)`)

  // Sort scheduled tasks by date and time
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
