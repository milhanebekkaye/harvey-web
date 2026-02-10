/**
 * Check-In Context Assembly
 *
 * Assembles context for the daily check-in message:
 * - Time of day (morning / afternoon / evening)
 * - Today's pending/in-progress tasks with titles and times
 * - Yesterday's completion summary (completed vs skipped vs total)
 * - Current streak (consecutive days with at least 1 completion)
 * - Recently skipped tasks (last 2 days) not yet rescheduled
 *
 * Used by POST /api/chat/checkin to generate a contextual greeting.
 */

import { prisma } from '../db/prisma'
import { getDateStringInTimezone, formatTimeInTimezone } from '../timezone'
import type { Task } from '@prisma/client'

export type TimeOfDay = 'morning' | 'afternoon' | 'evening'

export interface TodayTaskItem {
  title: string
  scheduledTime: string | null // HH:MM in user TZ, or null if no time
}

export interface YesterdaySummary {
  completed: number
  skipped: number
  total: number
}

export interface RecentSkippedItem {
  id: string
  title: string
  scheduledDateStr: string // YYYY-MM-DD in user TZ
}

export interface CheckInContext {
  timeOfDay: TimeOfDay
  todayTasks: TodayTaskItem[]
  yesterdaySummary: YesterdaySummary
  streak: number
  recentSkipped: RecentSkippedItem[]
  userTimezone: string
  todayStr: string
  yesterdayStr: string
}

/**
 * Get time of day from current hour in user's timezone.
 * morning = before 12:00, afternoon = 12:00–17:00, evening = after 17:00.
 */
function getTimeOfDay(now: Date, timeZone: string): TimeOfDay {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now)
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

/**
 * Add days to a YYYY-MM-DD date string.
 */
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().split('T')[0]
}

/**
 * Compute consecutive days with at least one completed task, counting backward from yesterday.
 * Looks at the last 30 days in user timezone.
 */
function computeStreak(tasks: Task[], userTimezone: string): number {
  const now = new Date()
  const todayStr = getDateStringInTimezone(now, userTimezone)
  const yesterdayStr = addDaysToDateStr(todayStr, -1)

  const completedByDate = new Set<string>()
  for (const t of tasks) {
    if (t.status !== 'completed' || !t.scheduledDate) continue
    const dateStr = getDateStringInTimezone(t.scheduledDate, userTimezone)
    completedByDate.add(dateStr)
  }

  let streak = 0
  let cursor = yesterdayStr
  for (let i = 0; i < 30; i++) {
    if (completedByDate.has(cursor)) {
      streak++
      cursor = addDaysToDateStr(cursor, -1)
    } else {
      break
    }
  }
  return streak
}

export interface AssembleCheckInContextOptions {
  /** Override time of day (for testing); when set, used instead of current time. */
  timeOfDayOverride?: TimeOfDay
}

/**
 * Assemble full check-in context for a project and user.
 *
 * @param projectId - Project UUID
 * @param userId - Authenticated user UUID
 * @param options - Optional overrides (e.g. timeOfDayOverride for testing)
 * @returns CheckInContext for the check-in prompt
 */
export async function assembleCheckInContext(
  projectId: string,
  userId: string,
  options?: AssembleCheckInContextOptions
): Promise<CheckInContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  })
  const userTimezone = user?.timezone || 'Europe/Paris'

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: { tasks: true },
  })
  if (!project) {
    throw new Error(`Project not found: ${projectId}`)
  }

  const tasks = project.tasks
  const now = new Date()
  const todayStr = getDateStringInTimezone(now, userTimezone)
  const yesterdayStr = addDaysToDateStr(todayStr, -1)
  const twoDaysAgoStr = addDaysToDateStr(todayStr, -2)

  const timeOfDay = options?.timeOfDayOverride ?? getTimeOfDay(now, userTimezone)

  // Today's tasks: pending or in_progress, scheduled for today (user TZ)
  const todayTasksRaw = tasks.filter((t) => {
    if (!t.scheduledDate) return false
    const taskDateStr = getDateStringInTimezone(t.scheduledDate, userTimezone)
    if (taskDateStr !== todayStr) return false
    return t.status === 'pending' || t.status === 'in_progress'
  })
  todayTasksRaw.sort(
    (a, b) =>
      (a.scheduledStartTime?.getTime() ?? 0) - (b.scheduledStartTime?.getTime() ?? 0)
  )
  const todayTasks: TodayTaskItem[] = todayTasksRaw.map((t) => ({
    title: t.title,
    scheduledTime: t.scheduledStartTime
      ? formatTimeInTimezone(t.scheduledStartTime, userTimezone, { hour12: false })
      : null,
  }))

  // Yesterday's summary: completed, skipped, total (by scheduled date in user TZ)
  const yesterdayTasks = tasks.filter((t) => {
    if (!t.scheduledDate) return false
    return getDateStringInTimezone(t.scheduledDate, userTimezone) === yesterdayStr
  })
  const yesterdaySummary: YesterdaySummary = {
    completed: yesterdayTasks.filter((t) => t.status === 'completed').length,
    skipped: yesterdayTasks.filter((t) => t.status === 'skipped').length,
    total: yesterdayTasks.length,
  }

  const streak = computeStreak(tasks, userTimezone)

  // Recent skipped: status = skipped, scheduled_date within last 2 days (yesterday or day before)
  const recentSkipped: RecentSkippedItem[] = tasks
    .filter((t) => {
      if (t.status !== 'skipped' || !t.scheduledDate) return false
      const taskDateStr = getDateStringInTimezone(t.scheduledDate, userTimezone)
      return taskDateStr === yesterdayStr || taskDateStr === twoDaysAgoStr
    })
    .map((t) => ({
      id: t.id,
      title: t.title,
      scheduledDateStr: getDateStringInTimezone(t.scheduledDate!, userTimezone),
    }))

  return {
    timeOfDay,
    todayTasks,
    yesterdaySummary,
    streak,
    recentSkipped,
    userTimezone,
    todayStr,
    yesterdayStr,
  }
}
