/**
 * Tool: get_progress_summary
 *
 * Get simple progress statistics for the current project schedule.
 * Keeps it simple — Claude formats the data conversationally.
 */

import { prisma } from '../../db/prisma'
import { getDateStringInTimezone } from '../../timezone'
import type { ProgressSummaryResult } from '../types'

interface GetProgressSummaryParams {
  period?: 'today' | 'this_week' | 'all'
}

/**
 * Execute the get_progress_summary tool.
 *
 * Filters tasks by the requested period and computes
 * basic completion statistics.
 *
 * @param params - Tool parameters from Claude
 * @param projectId - The project UUID
 * @param userId - The authenticated user UUID
 * @returns Progress statistics for the period
 */
export async function executeGetProgressSummary(
  params: GetProgressSummaryParams,
  projectId: string,
  userId: string
): Promise<ProgressSummaryResult> {
  try {
    const period = params.period || 'this_week'

    // Fetch all tasks and user (for timezone)
    const [tasks, user] = await Promise.all([
      prisma.task.findMany({ where: { projectId, userId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    ])
    const userTimezone = user?.timezone || 'Europe/Paris'

    // Filter by period (dates in user's timezone)
    const now = new Date()
    const todayStr = getDateStringInTimezone(now, userTimezone)

    let filteredTasks = tasks

    if (period === 'today') {
      filteredTasks = tasks.filter(
        (t) =>
          t.scheduledDate != null &&
          getDateStringInTimezone(t.scheduledDate, userTimezone) === todayStr
      )
    } else if (period === 'this_week') {
      // Monday–Sunday of current week in user's timezone
      const weekday = now.toLocaleDateString('en-US', {
        timeZone: userTimezone,
        weekday: 'long',
      })
      const days: string[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const dayIndex = days.indexOf(weekday)
      const daysBackToMonday = dayIndex === 0 ? 6 : dayIndex - 1
      const [y, m, d] = todayStr.split('-').map(Number)
      const mondayDate = new Date(Date.UTC(y, m - 1, d))
      mondayDate.setUTCDate(mondayDate.getUTCDate() - daysBackToMonday)
      const sundayDate = new Date(mondayDate)
      sundayDate.setUTCDate(sundayDate.getUTCDate() + 6)
      const mondayStr = mondayDate.toISOString().split('T')[0]
      const sundayStr = sundayDate.toISOString().split('T')[0]

      filteredTasks = tasks.filter((t) => {
        if (!t.scheduledDate) return false
        const taskDateStr = getDateStringInTimezone(t.scheduledDate, userTimezone)
        return taskDateStr >= mondayStr && taskDateStr <= sundayStr
      })
    }
    // period === 'all' uses all tasks (no filter)

    const completed = filteredTasks.filter((t) => t.status === 'completed').length
    const skipped = filteredTasks.filter((t) => t.status === 'skipped').length
    const pending = filteredTasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').length
    const total = filteredTasks.length
    const totalActioned = completed + skipped
    const completionRate = totalActioned > 0
      ? Math.round((completed / totalActioned) * 100)
      : 0

    return {
      period,
      total,
      completed,
      skipped,
      pending,
      completion_rate_percent: completionRate,
    }
  } catch (error) {
    console.error('[getProgressSummary] Error:', error)
    return {
      period: params.period || 'this_week',
      total: 0,
      completed: 0,
      skipped: 0,
      pending: 0,
      completion_rate_percent: 0,
    }
  }
}
