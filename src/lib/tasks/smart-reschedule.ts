/**
 * Smart reschedule suggestion (Feature 3).
 * Suggests a new slot based on skip reason and user availability.
 * No Claude API — pure constraint-based logic.
 */

import { prisma } from '../db/prisma'
import type { ContextData } from '../chat/types'
import { addDays, parseTimeToHours, getEffectiveAvailableTimeBlocks } from '../schedule/task-scheduler'
import {
  localTimeInTimezoneToUTC,
  getHourDecimalInTimezone,
  formatTimeInTimezone,
  getDateStringInTimezone,
} from '../timezone'

export type SkipReason =
  | 'too_tired'
  | 'ran_out_time'
  | 'task_unclear'
  | 'not_priority'
  | 'other'

export interface RescheduleSuggestion {
  canReschedule: true
  suggestedDate: string // YYYY-MM-DD
  suggestedTime: string // HH:MM
  suggestionText: string
}

/**
 * Get a personalized reschedule suggestion based on skip reason and availability.
 * Returns null for "not_priority" or if no slot found.
 */
export async function getSmartRescheduleSuggestion(
  taskId: string,
  skipReason: string
): Promise<RescheduleSuggestion | null> {
  if (skipReason === 'not_priority') {
    return null
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId },
    include: { project: true },
  })
  if (!task?.projectId) return null

  const user = await prisma.user.findUnique({
    where: { id: task.userId },
    select: { timezone: true, workSchedule: true, commute: true },
  })
  const userTimezone = user?.timezone || 'Europe/Paris'

  const project = await prisma.project.findFirst({
    where: { id: task.projectId, userId: task.userId },
    include: { tasks: true },
  })
  if (!project) return null

  const rawContext: ContextData = (project.contextData as unknown as ContextData) || {
    available_time: [],
    preferences: {},
  }
  const userBlocked = user
    ? { workSchedule: user.workSchedule as import('@/types/api.types').WorkScheduleShape | null, commute: user.commute as import('@/types/api.types').CommuteShape | null }
    : null
  const effectiveAvailable = getEffectiveAvailableTimeBlocks(
    rawContext.available_time || [],
    userBlocked
  )
  const contextData: ContextData = {
    ...rawContext,
    available_time: effectiveAvailable.length > 0 ? effectiveAvailable : (rawContext.available_time || []),
  }

  const now = new Date()
  const todayStr = getDateStringInTimezone(now, userTimezone)
  const fromDate = new Date(todayStr + 'T12:00:00.000Z')
  const existingTasks = project.tasks.filter(
    (t) =>
      t.status !== 'completed' &&
      t.status !== 'skipped' &&
      t.id !== taskId
  )

  const preferMorning = skipReason === 'too_tired'
  const minDurationMinutes = task.estimatedDuration

  const slot = findNextSlot(
    contextData,
    existingTasks,
    userTimezone,
    fromDate,
    minDurationMinutes,
    preferMorning
  )
  if (!slot) return null

  const suggestionText = buildSuggestionText(
    skipReason as SkipReason,
    slot.suggestedDate,
    slot.suggestedTime,
    userTimezone
  )

  return {
    canReschedule: true,
    suggestedDate: slot.suggestedDate,
    suggestedTime: slot.suggestedTime,
    suggestionText,
  }
}

interface SlotResult {
  suggestedDate: string
  suggestedTime: string
}

function findNextSlot(
  contextData: ContextData,
  existingTasks: Array<{
    scheduledDate: Date | null
    scheduledStartTime: Date | null
    scheduledEndTime: Date | null
  }>,
  userTimezone: string,
  fromDate: Date,
  durationMinutes: number,
  preferMorning: boolean
): SlotResult | null {
  const durationHours = durationMinutes / 60
  const maxDays = 14

  for (let dayOffset = 1; dayOffset <= maxDays; dayOffset++) {
    const currentDate = addDays(fromDate, dayOffset)
    const dateStr = getDateStringInTimezone(currentDate, userTimezone)
    const dayName = new Date(dateStr + 'T12:00:00.000Z')
      .toLocaleDateString('en-US', { timeZone: userTimezone, weekday: 'long' })
      .toLowerCase()

    const isOneOffBlocked = contextData.one_off_blocks?.some((block) => {
      if (block.date === dateStr && block.all_day) return true
      if (block.date_start && block.date_end) {
        return dateStr >= block.date_start && dateStr <= block.date_end && block.all_day
      }
      return false
    })
    if (isOneOffBlocked) continue

    const daySlots = (contextData.available_time || []).filter(
      (slot) => slot.day.toLowerCase() === dayName
    )
    if (preferMorning) {
      daySlots.sort((a, b) => parseTimeToHours(a.start) - parseTimeToHours(b.start))
    }

    for (const slot of daySlots) {
      let slotStartHours = parseTimeToHours(slot.start)
      const slotEndHours = parseTimeToHours(slot.end)
      let slotDuration =
        slotEndHours > slotStartHours
          ? slotEndHours - slotStartHours
          : 24 - slotStartHours + slotEndHours

      if (slotDuration < durationHours) continue
      if (preferMorning && slotStartHours >= 12) continue

      const dayTasks = existingTasks.filter((t) => {
        if (!t.scheduledDate) return false
        return getDateStringInTimezone(t.scheduledDate, userTimezone) === dateStr
      })
      const occupied = dayTasks
        .filter((t) => t.scheduledStartTime && t.scheduledEndTime)
        .map((t) => ({
          start: getHourDecimalInTimezone(t.scheduledStartTime!, userTimezone),
          end: getHourDecimalInTimezone(t.scheduledEndTime!, userTimezone),
        }))
        .sort((a, b) => a.start - b.start)

      const dayOneOffs = (contextData.one_off_blocks || []).filter(
        (b) => b.date === dateStr && !b.all_day && b.start_time && b.end_time
      )
      for (const b of dayOneOffs) {
        occupied.push({
          start: parseTimeToHours(b.start_time!),
          end: parseTimeToHours(b.end_time!),
        })
      }
      occupied.sort((a, b) => a.start - b.start)

      let searchStart = slotStartHours
      for (const occ of occupied) {
        if (occ.start >= slotEndHours) break
        if (occ.start - searchStart >= durationHours) {
          const startH = Math.floor(searchStart)
          const startM = Math.round((searchStart - startH) * 60)
          const suggestedTime = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`
          return { suggestedDate: dateStr, suggestedTime }
        }
        searchStart = Math.max(searchStart, occ.end)
      }
      if (slotEndHours - searchStart >= durationHours) {
        const startH = Math.floor(searchStart)
        const startM = Math.round((searchStart - startH) * 60)
        const suggestedTime = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`
        return { suggestedDate: dateStr, suggestedTime }
      }
    }
  }
  return null
}

function buildSuggestionText(
  reason: SkipReason,
  dateStr: string,
  timeStr: string,
  userTimezone: string
): string {
  const date = new Date(dateStr + 'T12:00:00.000Z')
  const dayLabel = date.toLocaleDateString('en-US', {
    timeZone: userTimezone,
    weekday: 'long',
  })
  const [h, m] = timeStr.split(':').map(Number)
  const timeDate = localTimeInTimezoneToUTC(dateStr, h, m, userTimezone)
  const timeFormatted = formatTimeInTimezone(timeDate, userTimezone, { hour12: true })

  switch (reason) {
    case 'too_tired':
      return `Want me to move this to ${dayLabel} at ${timeFormatted} when you're fresh?`
    case 'ran_out_time':
      return `Should I reschedule this for ${dayLabel} at ${timeFormatted} when you have more time?`
    case 'task_unclear':
      return `Want me to reschedule this for ${dayLabel} at ${timeFormatted} so you can clarify it first?`
    case 'other':
    default:
      return `Want me to reschedule this for ${dayLabel} at ${timeFormatted}?`
  }
}
