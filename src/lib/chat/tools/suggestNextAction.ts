/**
 * Tool: suggest_next_action
 *
 * Get structured data about the current schedule state
 * to recommend what the user should do next.
 *
 * Returns data for Claude to reason about — Claude composes
 * the actual recommendation conversationally.
 */

import { prisma } from '../../db/prisma'
import { getDateStringInTimezone, getHourDecimalInTimezone } from '../../timezone'
import type { SuggestNextActionResult } from '../types'

interface SuggestNextActionParams {
  available_minutes?: number
  context?: string
}

/**
 * Execute the suggest_next_action tool.
 *
 * Gathers current schedule state including today's tasks,
 * overdue items, and remaining time.
 *
 * @param params - Tool parameters from Claude
 * @param projectId - The project UUID
 * @param userId - The authenticated user UUID
 * @returns Structured data for Claude to reason about
 */
export async function executeSuggestNextAction(
  params: SuggestNextActionParams,
  projectId: string,
  userId: string
): Promise<SuggestNextActionResult> {
  try {
    // 1. Get project with tasks and user
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      include: { tasks: true },
    })

    if (!project) {
      return {
        current_task: null,
        next_task: null,
        overdue_tasks: [],
        remaining_time_today_minutes: 0,
        tasks_completed_today: 0,
        tasks_remaining_today: 0,
        suggestion_context: 'Project not found.',
      }
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    const userTimezone = user?.timezone || 'Europe/Paris'

    // 2. Get current time and today's date in user's timezone
    const now = new Date()
    const todayStr = getDateStringInTimezone(now, userTimezone)
    const currentHour = getHourDecimalInTimezone(now, userTimezone)

    // 3. Get today's tasks (by date in user's timezone)
    const todayTasks = project.tasks.filter(
      (t) =>
        t.scheduledDate != null &&
        getDateStringInTimezone(t.scheduledDate, userTimezone) === todayStr
    )

    // Sort by start time
    const sortedToday = todayTasks.sort((a, b) =>
      (a.scheduledStartTime?.getTime() || 0) - (b.scheduledStartTime?.getTime() || 0)
    )

    // 4. Find current task (the one that should be in progress right now)
    let currentTask = null
    let nextTask = null

    for (const task of sortedToday) {
      if (task.status === 'completed' || task.status === 'skipped') continue

      const startHour = task.scheduledStartTime
        ? getHourDecimalInTimezone(task.scheduledStartTime, userTimezone)
        : null
      const endHour = task.scheduledEndTime
        ? getHourDecimalInTimezone(task.scheduledEndTime, userTimezone)
        : null

      if (startHour !== null && endHour !== null) {
        if (currentHour >= startHour && currentHour < endHour) {
          currentTask = {
            id: task.id,
            title: task.title,
            start_time: task.scheduledStartTime?.toISOString() || null,
            end_time: task.scheduledEndTime?.toISOString() || null,
            description: task.description,
          }
        } else if (currentHour < startHour && !nextTask) {
          nextTask = {
            id: task.id,
            title: task.title,
            start_time: task.scheduledStartTime?.toISOString() || null,
            description: task.description,
          }
        }
      }
    }

    // If no current task found and no next task, find the first pending task
    if (!currentTask && !nextTask) {
      const firstPending = sortedToday.find((t) => t.status === 'pending')
      if (firstPending) {
        nextTask = {
          id: firstPending.id,
          title: firstPending.title,
          start_time: firstPending.scheduledStartTime?.toISOString() || null,
          description: firstPending.description,
        }
      }
    }

    // 5. Find overdue tasks (scheduled date in user TZ before today, still pending)
    const overdueTasks = project.tasks
      .filter((t) => {
        if (t.status !== 'pending') return false
        if (!t.scheduledDate) return false
        return getDateStringInTimezone(t.scheduledDate, userTimezone) < todayStr
      })
      .map((t) => ({
        id: t.id,
        title: t.title,
        original_date: getDateStringInTimezone(t.scheduledDate!, userTimezone),
        description: t.description,
      }))

    // 6. Count today's completed and remaining
    const tasksCompletedToday = todayTasks.filter((t) => t.status === 'completed').length
    const tasksRemainingToday = todayTasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').length

    // 7. Estimate remaining available time today
    // Sum up the duration of remaining tasks (rough estimate)
    const remainingMinutes = todayTasks
      .filter((t) => t.status === 'pending' || t.status === 'in_progress')
      .reduce((sum, t) => sum + t.estimatedDuration, 0)

    // 8. Build suggestion context from project notes
    const projectNotes = (project as Record<string, unknown>).projectNotes as string | null
    const suggestionContext = projectNotes || 'No specific notes about this user yet.'

    return {
      current_task: currentTask,
      next_task: nextTask,
      overdue_tasks: overdueTasks,
      remaining_time_today_minutes: remainingMinutes,
      tasks_completed_today: tasksCompletedToday,
      tasks_remaining_today: tasksRemainingToday,
      suggestion_context: suggestionContext,
    }
  } catch (error) {
    console.error('[suggestNextAction] Error:', error)
    return {
      current_task: null,
      next_task: null,
      overdue_tasks: [],
      remaining_time_today_minutes: 0,
      tasks_completed_today: 0,
      tasks_remaining_today: 0,
      suggestion_context: `Error fetching data: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
