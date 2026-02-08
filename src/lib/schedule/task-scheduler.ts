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
 * 2. Sort tasks by priority (high first, then by order)
 * 3. For each day in schedule period:
 *    - Get available slots for that day of week
 *    - For each slot, try to fit tasks by duration
 *    - If task doesn't fit, split it (min 1 hour chunks)
 *    - Track remaining hours for split tasks
 * 4. Return scheduled tasks with dates/times
 */

import type { ExtractedConstraints, ParsedTask, TimeBlock } from '../../types/api.types'
import { localTimeInTimezoneToUTC } from '../timezone'

// ============================================
// Types
// ============================================

/**
 * A task that has been assigned to a specific date and time
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
   * Start time as full datetime
   */
  startTime: Date

  /**
   * End time as full datetime
   */
  endTime: Date

  /**
   * Time block string for display: "09:00-11:00"
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
 * Internal representation of an available time slot
 */
interface TimeSlot {
  day: string // monday, tuesday, etc.
  startHours: number // decimal hours (9.5 = 9:30 AM)
  endHours: number // decimal hours
  label?: string
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

/**
 * Build availability map from constraints
 * Groups available time by day of week
 * 
 * Handles overnight slots (e.g., 21:00-02:00) by splitting them:
 * - Day 1: 21:00-24:00 (until midnight)
 * - Day 2: 00:00-02:00 (after midnight)
 *
 * @param constraints - Extracted constraints
 * @returns Map of day → array of time slots
 */
function buildAvailabilityMap(constraints: ExtractedConstraints): Map<string, TimeSlot[]> {
  const availability = new Map<string, TimeSlot[]>()

  // Day name mapping for calculating next day
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dayToIndex = new Map(dayNames.map((name, i) => [name, i]))

  for (const block of constraints.available_time || []) {
    const day = block.day.toLowerCase()
    const startHours = parseTimeToHours(block.start)
    const endHours = parseTimeToHours(block.end)

    if (!availability.has(day)) {
      availability.set(day, [])
    }

    // Check if slot crosses midnight (end time < start time)
    if (endHours < startHours) {
      console.log(`[TaskScheduler] Detected overnight slot: ${day} ${block.start}-${block.end}`)
      
      // Keep as ONE continuous slot using hours > 24 to represent next day
      // Example: 21:00-02:00 becomes startHours=21, endHours=26 (24 + 2)
      const adjustedEndHours = 24.0 + endHours
      
      availability.get(day)!.push({
        day,
        startHours: startHours,
        endHours: adjustedEndHours,
        label: block.label,
      })

      console.log(`  → Overnight slot: ${day} ${formatHoursToTime(startHours)}-${formatHoursToTime(adjustedEndHours)} (continuous)`)
    } else {
      // Normal slot within same day
      availability.get(day)!.push({
        day,
        startHours: startHours,
        endHours: endHours,
        label: block.label,
      })
    }
  }

  // Sort each day's slots by start time
  for (const [day, slots] of availability) {
    slots.sort((a, b) => a.startHours - b.startHours)
    availability.set(day, slots)
  }

  return availability
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
 *
 * @param tasks - Array of parsed tasks with hours and priority
 * @param constraints - User's scheduling constraints
 * @param startDate - When to start scheduling
 * @param durationWeeks - How many weeks to schedule
 * @param userTimezone - User's IANA timezone (e.g. Europe/Paris) so times are stored in UTC
 * @returns Schedule result with assigned tasks
 */
export function assignTasksToSchedule(
  tasks: ParsedTask[],
  constraints: ExtractedConstraints,
  startDate: Date,
  durationWeeks: number,
  userTimezone: string = 'UTC'
): ScheduleResult {
  console.log(
    `[TaskScheduler] Starting scheduling: ${tasks.length} tasks, ${durationWeeks} weeks, starting ${startDate.toISOString().split('T')[0]}`
  )

  const scheduledTasks: ScheduledTaskAssignment[] = []
  let totalHoursScheduled = 0

  // Build availability map (day → slots)
  const availability = buildAvailabilityMap(constraints)

  console.log('[TaskScheduler] Availability map:')
  for (const [day, slots] of availability) {
    console.log(
      `  ${day}: ${slots.map((s) => `${formatHoursToTime(s.startHours)}-${formatHoursToTime(s.endHours)}`).join(', ')}`
    )
  }

  // First order by dependencies (dependents after their dependencies), then by priority, then by index
  const dependencyOrder = sortIndicesByDependencies(tasks)
  const sortedTaskIndices = dependencyOrder.sort((a, b) => {
    const priorityOrder = { high: 1, medium: 2, low: 3 }
    const aPriority = priorityOrder[tasks[a].priority] || 2
    const bPriority = priorityOrder[tasks[b].priority] || 2
    if (aPriority !== bPriority) return aPriority - bPriority
    return a - b // Maintain dependency/order for same priority
  })

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

      const slotDuration = slot.endHours - slot.startHours

      if (slotDuration <= 0) continue

      let slotFilled = 0
      let currentSlotStartHours = slot.startHours

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
            timeBlock: `${formatHoursToTime(currentSlotStartHours)}-${formatHoursToTime(taskEndHours)}`,
            partNumber: task.partNumber > 1 ? task.partNumber : undefined,
            hoursAssigned: task.remainingHours,
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
              timeBlock: `${formatHoursToTime(currentSlotStartHours)}-${formatHoursToTime(taskEndHours)}`,
              partNumber: task.partNumber,
              hoursAssigned: hoursThisSlot,
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
 *
 * @param taskIndex - Index of the task in the original array
 * @param scheduledTasks - All scheduled task assignments
 * @returns Database-ready schedule data or null if not scheduled
 */
export function getTaskScheduleData(
  taskIndex: number,
  scheduledTasks: ScheduledTaskAssignment[]
): { scheduledDate: Date; scheduledStartTime: Date; scheduledEndTime: Date } | null {
  // Find the first scheduled block for this task (sorted by date/time)
  const firstBlock = scheduledTasks.find((st) => st.taskIndex === taskIndex)

  if (!firstBlock) {
    return null
  }

  return {
    scheduledDate: firstBlock.date,
    scheduledStartTime: firstBlock.startTime,
    scheduledEndTime: firstBlock.endTime,
  }
}
