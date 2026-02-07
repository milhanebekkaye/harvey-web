/**
 * Task Service
 *
 * Handles all database operations for tasks.
 * Provides functions for fetching, updating, and grouping tasks.
 *
 * Task grouping logic:
 * - TODAY: Tasks scheduled for today
 * - TOMORROW: Tasks scheduled for tomorrow
 * - THIS WEEK: Tasks scheduled between tomorrow and end of week
 * - LATER: Tasks scheduled after this week
 * - UNSCHEDULED: Tasks without a scheduled date
 */

import { prisma } from '../db/prisma'
import type { Task, Project } from '@prisma/client'
import type { DashboardTask, TaskGroups, DatabaseTaskStatus, DaySection } from '../../types/task.types'
import { mapToUIStatus, formatDuration, getDayAbbreviation, getHourDecimal, parseSuccessCriteria, normalizeTaskLabel } from '../../types/task.types'

// ============================================
// Types
// ============================================

/**
 * Data for updating a task
 */
export interface UpdateTaskData {
  title?: string
  description?: string
  status?: 'pending' | 'in_progress' | 'completed' | 'skipped'
}

/**
 * Response wrapper for task operations
 */
export interface TaskServiceResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    message: string
    code?: string
    details?: unknown
  }
}

// ============================================
// Date Helper Functions
// ============================================

/**
 * Get start of day (midnight) for a date in local timezone
 */
function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

/**
 * Get end of day (23:59:59.999) for a date
 */
function endOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

/**
 * Add days to a date
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Get the end of the current week (Sunday at 23:59:59.999)
 */
function getEndOfWeek(date: Date): Date {
  const result = new Date(date)
  const dayOfWeek = result.getDay() // 0 = Sunday
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
  result.setDate(result.getDate() + daysUntilSunday)
  return endOfDay(result)
}

/**
 * Check if two dates are the same day
 */
function isSameDay(date1: Date | null | undefined, date2: Date): boolean {
  if (!date1) return false
  return startOfDay(date1).getTime() === startOfDay(date2).getTime()
}

/**
 * Check if date is between two dates (exclusive)
 */
function isBetween(date: Date | null | undefined, start: Date, end: Date): boolean {
  if (!date) return false
  const time = date.getTime()
  return time > start.getTime() && time <= end.getTime()
}

/**
 * Check if date is after another date
 */
function isAfter(date: Date | null | undefined, compareDate: Date): boolean {
  if (!date) return false
  return date.getTime() > compareDate.getTime()
}

/**
 * Check if date is before another date
 */
function isBefore(date: Date | null | undefined, compareDate: Date): boolean {
  if (!date) return false
  return date.getTime() < compareDate.getTime()
}

/**
 * Get the full day name from a date
 */
function getDayName(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[date.getDay()]
}

/**
 * Format date to ISO date string (YYYY-MM-DD)
 */
function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Get end of next week (Sunday of next week at 23:59:59.999)
 */
function getEndOfNextWeek(date: Date): Date {
  const endOfThisWeek = getEndOfWeek(date)
  return addDays(endOfThisWeek, 7)
}

// ============================================
// Transform Functions
// ============================================

/**
 * Transform database Task to DashboardTask for UI display
 *
 * Maps database fields to UI-friendly format:
 * - estimatedDuration (minutes) → duration (formatted string)
 * - status + priority → UI status (with urgent/focus)
 * - successCriteria → checklist items
 * - scheduledDate/Times → day, startTime, endTime
 */
export function transformToDashboardTask(dbTask: Task): DashboardTask {
  // Calculate start and end times
  let startTime = 9 // Default 9 AM
  let endTime = 10 // Default 10 AM

  if (dbTask.scheduledStartTime) {
    startTime = getHourDecimal(dbTask.scheduledStartTime)
  }

  if (dbTask.scheduledEndTime) {
    endTime = getHourDecimal(dbTask.scheduledEndTime)
  } else if (dbTask.scheduledStartTime) {
    // Calculate end time from start time + duration
    endTime = startTime + dbTask.estimatedDuration / 60
  }

  return {
    id: dbTask.id,
    title: dbTask.title,
    description: dbTask.description || '',
    duration: formatDuration(dbTask.estimatedDuration),
    label: normalizeTaskLabel(dbTask.label),
    status: mapToUIStatus(dbTask.status as DatabaseTaskStatus, dbTask.priority),
    checklist: parseSuccessCriteria(dbTask.successCriteria ?? ''),
    harveyTip: undefined, // Could generate on-demand in the future
    day: dbTask.scheduledDate ? getDayAbbreviation(dbTask.scheduledDate) : '',
    startTime,
    endTime,
    priority: dbTask.priority,
    estimatedMinutes: dbTask.estimatedDuration,
    scheduledDate: dbTask.scheduledDate?.toISOString(),
    projectId: dbTask.projectId || undefined,
  }
}

/**
 * Group tasks by date category with individual days
 *
 * Categories:
 * - overdue: Tasks scheduled before today that are not completed/skipped
 * - today: Tasks scheduled for today
 * - tomorrow: Tasks scheduled for tomorrow
 * - weekDays: Individual days for the rest of this week (after tomorrow)
 * - nextWeek: Tasks scheduled for next week
 * - later: Tasks scheduled more than 2 weeks out
 * - unscheduled: Tasks without a scheduled date
 */
function groupTasksByDate(tasks: DashboardTask[]): TaskGroups {
  // Get today's date (date-only, no time component)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrowStart = addDays(todayStart, 1)
  const tomorrowEnd = endOfDay(tomorrowStart)
  const weekEnd = getEndOfWeek(now)
  const nextWeekEnd = getEndOfNextWeek(now)

  // Build weekDays structure for days after tomorrow until end of week
  const weekDaysMap: Map<string, DaySection> = new Map()

  // Pre-populate days from day after tomorrow to end of week
  let currentDay = addDays(tomorrowStart, 1) // Start from day after tomorrow
  while (currentDay <= weekEnd) {
    const dateStr = toISODateString(currentDay)
    const dayName = getDayName(currentDay)
    weekDaysMap.set(dateStr, {
      key: dayName.toLowerCase(),
      label: dayName.toUpperCase(),
      date: dateStr,
      tasks: [],
    })
    currentDay = addDays(currentDay, 1)
  }

  const groups: TaskGroups = {
    overdue: [],
    today: [],
    tomorrow: [],
    weekDays: [],
    nextWeek: [],
    later: [],
    unscheduled: [],
  }

  for (const task of tasks) {
    if (!task.scheduledDate) {
      groups.unscheduled.push(task)
      continue
    }

    // Parse scheduledDate as date-only (ignore time component)
    const taskDateObj = new Date(task.scheduledDate)
    const taskDate = new Date(taskDateObj.getFullYear(), taskDateObj.getMonth(), taskDateObj.getDate())
    const taskDateStr = toISODateString(taskDate)

    // Check if task is overdue (before today and not completed/skipped)
    if (isBefore(taskDate, todayStart) && task.status !== 'completed' && task.status !== 'skipped') {
      groups.overdue.push(task)
    } else if (isSameDay(taskDate, todayStart)) {
      groups.today.push(task)
    } else if (isSameDay(taskDate, tomorrowStart)) {
      groups.tomorrow.push(task)
    } else if (isBetween(taskDate, tomorrowEnd, weekEnd)) {
      // This week (after tomorrow) - add to individual day
      const daySection = weekDaysMap.get(taskDateStr)
      if (daySection) {
        daySection.tasks.push(task)
      }
    } else if (isBetween(taskDate, weekEnd, nextWeekEnd)) {
      // Next week
      groups.nextWeek.push(task)
    } else if (isAfter(taskDate, nextWeekEnd)) {
      // Later (beyond next week)
      groups.later.push(task)
    } else {
      // Past completed/skipped tasks - add to today (for reference)
      groups.today.push(task)
    }
  }

  // Convert weekDaysMap to array, filtering out empty days
  groups.weekDays = Array.from(weekDaysMap.values()).filter(
    (section) => section.tasks.length > 0
  )

  // Sort by start time, treating early morning (0-6am) as "overnight continuation"
  // that should come AFTER evening tasks (18:00-23:59)
  const sortByTime = (a: DashboardTask, b: DashboardTask) => {
    // Adjust times for overnight sorting:
    // Tasks starting 0:00-6:00 are treated as if they start at 24:00-30:00
    // This ensures they sort AFTER tasks starting 18:00-23:59
    const adjustedA = a.startTime < 6 ? a.startTime + 24 : a.startTime
    const adjustedB = b.startTime < 6 ? b.startTime + 24 : b.startTime
    
    return adjustedA - adjustedB
  }

  // Sort overdue by date (oldest first), then by time
  groups.overdue.sort((a, b) => {
    const dateCompare = (a.scheduledDate || '').localeCompare(b.scheduledDate || '')
    return dateCompare !== 0 ? dateCompare : sortByTime(a, b)
  })
  groups.today.sort(sortByTime)
  groups.tomorrow.sort(sortByTime)

  // Sort weekDays sections by date, and tasks within each section by time
  groups.weekDays.sort((a, b) => a.date.localeCompare(b.date))
  groups.weekDays.forEach((section) => section.tasks.sort(sortByTime))

  // Sort nextWeek and later by date first, then by time
  const sortByDateThenTime = (a: DashboardTask, b: DashboardTask) => {
    const dateCompare = (a.scheduledDate || '').localeCompare(b.scheduledDate || '')
    return dateCompare !== 0 ? dateCompare : sortByTime(a, b)
  }
  groups.nextWeek.sort(sortByDateThenTime)
  groups.later.sort(sortByDateThenTime)

  return groups
}

// ============================================
// Service Functions
// ============================================

/**
 * Get the user's active project
 *
 * Returns the most recent active project for the user.
 * A user typically has one active project at a time.
 *
 * @param userId - User ID
 * @returns Active project or null if none found
 */
export async function getActiveProject(
  userId: string
): Promise<TaskServiceResponse<Project>> {
  try {
    console.log('[TaskService] Getting active project for user:', userId)

    const project = await prisma.project.findFirst({
      where: {
        userId: userId,
        status: 'active',
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (!project) {
      console.log('[TaskService] No active project found')
      return {
        success: false,
        error: {
          message: 'No active project found',
          code: 'NO_PROJECT',
        },
      }
    }

    console.log('[TaskService] Found active project:', project.id, project.title)

    return {
      success: true,
      data: project,
    }
  } catch (error: unknown) {
    console.error('[TaskService] Error getting active project:', error)
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to get project',
        details: error,
      },
    }
  }
}

/**
 * Get all tasks for a project
 *
 * Fetches tasks belonging to a specific project.
 * Validates that the project belongs to the user.
 *
 * @param projectId - Project UUID
 * @param userId - User ID for ownership validation
 * @returns Array of tasks or error
 */
export async function getTasksForProject(
  projectId: string,
  userId: string
): Promise<TaskServiceResponse<Task[]>> {
  try {
    console.log('[TaskService] Fetching tasks for project:', projectId)

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: userId,
      },
    })

    if (!project) {
      console.log('[TaskService] Project not found or not owned by user')
      return {
        success: false,
        error: {
          message: 'Project not found',
          code: 'PROJECT_NOT_FOUND',
        },
      }
    }

    // Fetch tasks
    const tasks = await prisma.task.findMany({
      where: {
        projectId: projectId,
        userId: userId,
      },
      orderBy: [
        { scheduledDate: 'asc' },
        { scheduledStartTime: 'asc' },
        { priority: 'asc' },
      ],
    })

    console.log('[TaskService] Found', tasks.length, 'tasks')

    return {
      success: true,
      data: tasks,
    }
  } catch (error: unknown) {
    console.error('[TaskService] Error fetching tasks:', error)
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to fetch tasks',
        details: error,
      },
    }
  }
}

/**
 * Get grouped tasks for a user's active project
 *
 * Main function for dashboard - fetches tasks and groups them by date.
 *
 * @param userId - User ID
 * @returns Grouped tasks (today, tomorrow, thisWeek, unscheduled) or error
 */
export async function getGroupedTasks(
  userId: string
): Promise<TaskServiceResponse<{ tasks: TaskGroups; project: Project }>> {
  try {
    console.log('[TaskService] Getting grouped tasks for user:', userId)

    // Get active project
    const projectResult = await getActiveProject(userId)
    if (!projectResult.success || !projectResult.data) {
      return {
        success: false,
        error: projectResult.error || { message: 'No active project' },
      }
    }

    const project = projectResult.data

    // Fetch tasks for project
    const tasksResult = await getTasksForProject(project.id, userId)
    if (!tasksResult.success || !tasksResult.data) {
      return {
        success: false,
        error: tasksResult.error || { message: 'Failed to fetch tasks' },
      }
    }

    // Transform to dashboard format
    const dashboardTasks = tasksResult.data.map(transformToDashboardTask)

    // Group by date
    const groupedTasks = groupTasksByDate(dashboardTasks)

    console.log('[TaskService] Grouped tasks:', {
      overdue: groupedTasks.overdue.length,
      today: groupedTasks.today.length,
      tomorrow: groupedTasks.tomorrow.length,
      weekDays: groupedTasks.weekDays.map((d) => `${d.label}: ${d.tasks.length}`),
      nextWeek: groupedTasks.nextWeek.length,
      later: groupedTasks.later.length,
      unscheduled: groupedTasks.unscheduled.length,
    })

    return {
      success: true,
      data: {
        tasks: groupedTasks,
        project: project,
      },
    }
  } catch (error: unknown) {
    console.error('[TaskService] Error getting grouped tasks:', error)
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to get tasks',
        details: error,
      },
    }
  }
}

/**
 * Get a single task by ID
 *
 * Validates ownership before returning.
 *
 * @param taskId - Task UUID
 * @param userId - User ID for ownership validation
 * @returns Task or error
 */
export async function getTaskById(
  taskId: string,
  userId: string
): Promise<TaskServiceResponse<Task>> {
  try {
    console.log('[TaskService] Getting task:', taskId)

    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        userId: userId,
      },
    })

    if (!task) {
      console.log('[TaskService] Task not found or not owned by user')
      return {
        success: false,
        error: {
          message: 'Task not found',
          code: 'TASK_NOT_FOUND',
        },
      }
    }

    return {
      success: true,
      data: task,
    }
  } catch (error: unknown) {
    console.error('[TaskService] Error getting task:', error)
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to get task',
        details: error,
      },
    }
  }
}

/**
 * Update task checklist (success criteria progress)
 *
 * @param taskId - Task UUID
 * @param userId - User ID for ownership validation
 * @param checklist - Array of {id, text, done}
 * @returns Updated task or error
 */
export async function updateTaskChecklist(
  taskId: string,
  userId: string,
  checklist: Array<{ id: string; text: string; done: boolean }>
): Promise<TaskServiceResponse<Task>> {
  try {
    console.log('[TaskService] Updating checklist for task:', taskId)

    // Verify ownership
    const existing = await prisma.task.findFirst({
      where: {
        id: taskId,
        userId: userId,
      },
    })

    if (!existing) {
      return {
        success: false,
        error: {
          message: 'Task not found',
          code: 'TASK_NOT_FOUND',
        },
      }
    }

    // Update successCriteria with new checklist state
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        successCriteria: checklist, // Now stored as JSON
        updatedAt: new Date(),
      },
    })

    console.log('[TaskService] Checklist updated successfully')

    return {
      success: true,
      data: task,
    }
  } catch (error: unknown) {
    console.error('[TaskService] Error updating checklist:', error)
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to update checklist',
        details: error,
      },
    }
  }
}

/**
 * Update a task
 *
 * Updates task fields like title, description, status.
 * Validates ownership before updating.
 * Automatically sets completedAt/skippedAt when status changes.
 *
 * @param taskId - Task UUID
 * @param userId - User ID for ownership validation
 * @param data - Fields to update
 * @returns Updated task or error
 */
export async function updateTask(
  taskId: string,
  userId: string,
  data: UpdateTaskData
): Promise<TaskServiceResponse<Task>> {
  try {
    console.log('[TaskService] Updating task:', taskId, data)

    // Verify ownership
    const existing = await prisma.task.findFirst({
      where: {
        id: taskId,
        userId: userId,
      },
    })

    if (!existing) {
      console.log('[TaskService] Task not found or not owned by user')
      return {
        success: false,
        error: {
          message: 'Task not found',
          code: 'TASK_NOT_FOUND',
        },
      }
    }

    // Prepare update data with timestamps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {
      updatedAt: new Date(),
    }

    if (data.title !== undefined) {
      updateData.title = data.title
    }

    if (data.description !== undefined) {
      updateData.description = data.description
    }

    if (data.status !== undefined) {
      updateData.status = data.status

      // Set timestamp based on status
      if (data.status === 'completed') {
        updateData.completedAt = new Date()
        updateData.skippedAt = null
      } else if (data.status === 'skipped') {
        updateData.skippedAt = new Date()
        updateData.completedAt = null
      } else {
        // Resetting to pending or in_progress
        updateData.completedAt = null
        updateData.skippedAt = null
      }
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
    })

    console.log('[TaskService] Task updated successfully')

    return {
      success: true,
      data: task,
    }
  } catch (error: unknown) {
    console.error('[TaskService] Error updating task:', error)
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to update task',
        details: error,
      },
    }
  }
}

/**
 * Update task status (convenience function)
 *
 * Wrapper around updateTask specifically for status changes.
 *
 * @param taskId - Task UUID
 * @param userId - User ID for ownership validation
 * @param status - New status
 * @returns Updated task or error
 */
export async function updateTaskStatus(
  taskId: string,
  userId: string,
  status: 'completed' | 'skipped' | 'pending' | 'in_progress'
): Promise<TaskServiceResponse<Task>> {
  return updateTask(taskId, userId, { status })
}


/**
 * Delete all tasks for a specific project (Hard Reset)
 */
export async function deleteAllTasksForProject(projectId: string) {
  try {
    const result = await prisma.task.deleteMany({
      where: {
        projectId: projectId
      }
    })
    return { success: true, count: result.count }
  } catch (error) {
    console.error('Error deleting project tasks:', error)
    return { success: false, error }
  }
}
