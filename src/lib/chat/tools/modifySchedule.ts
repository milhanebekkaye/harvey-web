/**
 * Tool: modify_schedule
 *
 * Move or resize a specific task in the schedule.
 * Checks for time conflicts with other tasks and validates
 * that dependency constraints are not broken.
 */

import { prisma } from '../../db/prisma'
import type { Prisma } from '@prisma/client'
import type { ModifyScheduleResult } from '../types'
import { localTimeInTimezoneToUTC, formatTimeInTimezone } from '../../timezone'

interface ModifyScheduleParams {
  task_id: string
  new_date?: string       // YYYY-MM-DD
  new_start_time?: string // HH:MM 24h
  new_end_time?: string   // HH:MM 24h
  new_duration?: number   // minutes
}

/**
 * Execute the modify_schedule tool.
 *
 * Moves or resizes a task, checking for conflicts and dependency issues.
 *
 * @param params - Tool parameters from Claude
 * @param projectId - The project UUID
 * @param userId - The authenticated user UUID
 * @returns Result with success status and any conflict details
 */
export async function executeModifySchedule(
  params: ModifyScheduleParams,
  projectId: string,
  userId: string
): Promise<ModifyScheduleResult> {
  try {
    const { task_id, new_date, new_start_time, new_end_time, new_duration } = params

    // 1. Fetch the task
    const task = await prisma.task.findFirst({
      where: { id: task_id, projectId, userId },
    })

    if (!task) {
      return { success: false, message: `Task not found: ${task_id}` }
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    })
    const userTimezone = dbUser?.timezone || 'Europe/Paris'

    // 2. Build update data
    const updateData: Record<string, unknown> = {}

    // Parse new date
    let targetDate = task.scheduledDate
    if (new_date) {
      targetDate = new Date(new_date + 'T00:00:00.000Z')
      updateData.scheduledDate = targetDate
    }

    // Parse new start/end times
    let targetStart = task.scheduledStartTime
    let targetEnd = task.scheduledEndTime

    const dateStr = targetDate ? (targetDate as Date).toISOString().split('T')[0] : null
    if (new_start_time && targetDate && dateStr) {
      const [hours, mins] = new_start_time.split(':').map(Number)
      targetStart = localTimeInTimezoneToUTC(dateStr, hours ?? 0, mins ?? 0, userTimezone)
      updateData.scheduledStartTime = targetStart
    }

    if (new_end_time && targetDate && dateStr) {
      const [hours, mins] = new_end_time.split(':').map(Number)
      targetEnd = localTimeInTimezoneToUTC(dateStr, hours ?? 0, mins ?? 0, userTimezone)
      updateData.scheduledEndTime = targetEnd
    }

    // If new_duration is provided, adjust end time from start
    if (new_duration != null && targetStart) {
      targetEnd = new Date(targetStart.getTime() + new_duration * 60 * 1000)
      updateData.scheduledEndTime = targetEnd
      updateData.estimatedDuration = new_duration
    }

    if (Object.keys(updateData).length === 0) {
      return { success: false, message: 'No changes specified. Provide a new date, time, or duration.' }
    }

    // 3. Check for time conflicts with other tasks on the same date
    const conflicts: string[] = []
    if (targetDate && targetStart && targetEnd) {
      const dateStr = (targetDate as Date).toISOString().split('T')[0]
      const sameDayTasks = await prisma.task.findMany({
        where: {
          projectId,
          id: { not: task_id },
          status: { in: ['pending', 'in_progress'] },
          scheduledDate: {
            gte: new Date(dateStr + 'T00:00:00.000Z'),
            lt: new Date(dateStr + 'T23:59:59.999Z'),
          },
        },
      })

      for (const other of sameDayTasks) {
        if (other.scheduledStartTime && other.scheduledEndTime) {
          const otherStart = other.scheduledStartTime.getTime()
          const otherEnd = other.scheduledEndTime.getTime()
          const newStart = (targetStart as Date).getTime()
          const newEnd = (targetEnd as Date).getTime()

          // Overlap check
          if (newStart < otherEnd && newEnd > otherStart) {
            conflicts.push(
              `"${other.title}" (${formatTimeInTimezone(other.scheduledStartTime, userTimezone, { hour12: false })}–${formatTimeInTimezone(other.scheduledEndTime, userTimezone, { hour12: false })})`
            )
          }
        }
      }
    }

    if (conflicts.length > 0) {
      return {
        success: false,
        message: `Can't move task there — it conflicts with: ${conflicts.join(', ')}. Choose a different time.`,
        conflicts,
      }
    }

    // 4. Check dependency constraints
    const dependency_issues: string[] = []
    const targetDateMs = targetDate ? (targetDate as Date).getTime() : null

    // Check: tasks this task depends on must be scheduled BEFORE
    const dependsOn = (task as unknown as { depends_on: string[] }).depends_on ?? []
    if (dependsOn.length > 0) {
      const dependencies = await prisma.task.findMany({
        where: { id: { in: dependsOn }, projectId },
      })
      for (const dep of dependencies) {
        if (dep.scheduledDate && targetDateMs) {
          if (dep.scheduledDate.getTime() > targetDateMs) {
            dependency_issues.push(
              `This task depends on "${dep.title}" which is scheduled for ${dep.scheduledDate.toISOString().split('T')[0]} (after the new date)`
            )
          }
        }
      }
    }

    // Check: tasks that depend on this task must be scheduled AFTER
    const dependents = await prisma.task.findMany({
      where: {
        projectId,
        depends_on: { has: task_id },
      } as Prisma.TaskWhereInput,
    })
    for (const dep of dependents) {
      if (dep.scheduledDate && targetDateMs) {
        if (dep.scheduledDate.getTime() < targetDateMs) {
          dependency_issues.push(
            `"${dep.title}" depends on this task but is scheduled for ${dep.scheduledDate.toISOString().split('T')[0]} (before the new date)`
          )
        }
      }
    }

    if (dependency_issues.length > 0) {
      return {
        success: false,
        message: `Moving this task would break dependency constraints: ${dependency_issues.join('; ')}`,
        dependency_issues,
      }
    }

    // 5. Apply the update
    await prisma.task.update({
      where: { id: task_id },
      data: updateData,
    })

    // Build a human-readable summary of what changed
    const changes: string[] = []
    if (new_date) changes.push(`date to ${new_date}`)
    if (new_start_time) changes.push(`start time to ${new_start_time}`)
    if (new_end_time) changes.push(`end time to ${new_end_time}`)
    if (new_duration) changes.push(`duration to ${new_duration} minutes`)

    return {
      success: true,
      message: `Task "${task.title}" updated: ${changes.join(', ')}.`,
    }
  } catch (error) {
    console.error('[modifySchedule] Error:', error)
    return {
      success: false,
      message: `Failed to modify task: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
