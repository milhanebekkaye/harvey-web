/**
 * Context Assembly for Post-Onboarding Chat
 *
 * Builds the dynamic system prompt that Claude receives with every message.
 * Queries the database for live project data and computes stats.
 *
 * This is the most important function in the chat router feature.
 * The system prompt is rebuilt for EVERY message from live DB data.
 */

import { prisma } from '../db/prisma'
import { getDateStringInTimezone } from '../timezone'
import type { Task, Project, User, TaskStats, ContextData } from './types'

// ============================================
// Main Entry Point
// ============================================

/**
 * Assemble the full system prompt for post-onboarding project chat.
 *
 * Queries the database for the project, user, and all tasks,
 * then builds a detailed system prompt with live context.
 *
 * @param projectId - The project UUID
 * @param userId - The authenticated user UUID
 * @returns The complete system prompt string for Claude
 */
export async function assembleProjectChatContext(
  projectId: string,
  userId: string
): Promise<string> {
  console.log('[assembleContext] assembleContext.ts assembleProjectChatContext(projectId, userId)', {
    projectId: projectId.slice(0, 8),
    userId: userId.slice(0, 8),
  })

  // 1. Fetch project with all related tasks
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { tasks: true },
  })

  if (!project) {
    throw new Error(`Project not found: ${projectId}`)
  }
  console.log('[assembleContext] assembleContext.ts project found', {
    projectId: project.id,
    tasksLength: project.tasks.length,
  })

  // 2. Fetch user (for timezone, name)
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }
  console.log('[assembleContext] assembleContext.ts user found', {
    userId: user.id,
    userName: (user as { name?: string | null }).name ?? undefined,
  })

  // 3. Compute stats from tasks (user timezone for "today")
  const userTimezone = (user as User & { timezone?: string | null }).timezone || 'Europe/Paris'
  const stats = computeTaskStats(project.tasks, userTimezone)
  console.log('[assembleContext] assembleContext.ts stats', {
    total: stats.total,
    completed: stats.completed,
    pending: stats.pending,
    todayTasksLength: stats.todayTasks.length,
  })

  // 4. Limit schedule to today + next 7 days (and unscheduled) for smaller prompt
  const now = new Date()
  const todayStr = getDateStringInTimezone(now, userTimezone)
  const [y, m, d] = todayStr.split('-').map(Number)
  const endOfWindow = new Date(Date.UTC(y, m - 1, d))
  endOfWindow.setUTCDate(endOfWindow.getUTCDate() + 7)
  const endDateStr = getDateStringInTimezone(endOfWindow, userTimezone)

  const scheduleTasks = project.tasks.filter((t) => {
    if (!t.scheduledDate) return true
    const taskDateStr = getDateStringInTimezone(t.scheduledDate, userTimezone)
    return taskDateStr >= todayStr && taskDateStr <= endDateStr
  })
  const tasksBeyondWindow = project.tasks.filter((t) => {
    if (!t.scheduledDate) return false
    const taskDateStr = getDateStringInTimezone(t.scheduledDate, userTimezone)
    return taskDateStr > endDateStr
  })

  // 5. Build and return system prompt string
  const systemPrompt = buildSystemPrompt(project, user, stats, scheduleTasks, tasksBeyondWindow.length, userTimezone)
  console.log('[assembleContext] assembleContext.ts returning systemPrompt length', systemPrompt.length)
  return systemPrompt
}

// ============================================
// Stats Computation
// ============================================

/**
 * Compute statistics from a project's task list.
 *
 * Calculates completion rate, today's tasks, skip patterns,
 * and time estimation accuracy. When userTimezone is provided,
 * "today" is the current date in that timezone.
 *
 * @param tasks - All tasks for the project
 * @param userTimezone - Optional IANA timezone (e.g. "Europe/Paris"); if omitted, uses UTC
 * @returns Computed task statistics
 */
export function computeTaskStats(tasks: Task[], userTimezone?: string): TaskStats {
  const completed = tasks.filter((t) => t.status === 'completed')
  const skipped = tasks.filter((t) => t.status === 'skipped')
  const pending = tasks.filter((t) => t.status === 'pending')

  // Today's tasks (in user's timezone when provided)
  const now = new Date()
  const today = userTimezone
    ? getDateStringInTimezone(now, userTimezone)
    : now.toISOString().split('T')[0]
  const todayTasks = tasks.filter((t) => {
    if (!t.scheduledDate) return false
    const taskDateStr = userTimezone
      ? getDateStringInTimezone(t.scheduledDate, userTimezone)
      : t.scheduledDate.toISOString().split('T')[0]
    return taskDateStr === today
  })

  // Completion rate
  const totalActioned = completed.length + skipped.length
  const completionRate =
    totalActioned > 0
      ? Math.round((completed.length / totalActioned) * 100)
      : 0

  // Time estimation accuracy (only for completed tasks with actual duration)
  const withActual = completed.filter((t) => (t as unknown as { actualDuration?: number | null }).actualDuration != null)
  const avgAccuracy =
    withActual.length > 0
      ? withActual.reduce(
          (acc, t) => acc + (t as unknown as { actualDuration: number }).actualDuration / t.estimatedDuration,
          0
        ) / withActual.length
      : null

  // Common skip reasons
  const skipReasons = skipped
    .filter((t) => (t as unknown as { skipReason?: string | null }).skipReason)
    .reduce(
      (acc, t) => {
        const reason = (t as unknown as { skipReason: string }).skipReason
        acc[reason] = (acc[reason] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

  return {
    total: tasks.length,
    completed: completed.length,
    skipped: skipped.length,
    pending: pending.length,
    todayTasks,
    completionRate,
    avgAccuracy,
    skipReasons,
    currentBatch: Math.max(...tasks.map((t) => (t as unknown as { batchNumber: number }).batchNumber ?? 1), 1),
  }
}

// ============================================
// System Prompt Builder
// ============================================

/**
 * Build the complete system prompt for Claude.
 *
 * Includes Harvey's personality, project context, constraints,
 * schedule (today + 7 days, compact format), stats, and tool usage instructions.
 *
 * @param project - The project with tasks included
 * @param user - The authenticated user
 * @param stats - Computed task statistics
 * @param scheduleTasks - Tasks in window (today + 7 days) or unscheduled
 * @param tasksBeyondWindow - Count of tasks after the 7-day window
 * @param userTimezone - User's IANA timezone
 * @returns The full system prompt string
 */
function buildSystemPrompt(
  project: Project & { tasks: Task[] },
  user: User,
  stats: TaskStats,
  scheduleTasks: Task[],
  tasksBeyondWindow: number,
  userTimezone: string
): string {
  const contextData = (project.contextData as unknown as ContextData) || {
    available_time: [],
    blocked_time: [],
    preferences: {},
  }

  // Format current time in user's timezone
  const now = new Date()
  const localTime = now.toLocaleString('en-US', { timeZone: userTimezone })
  const localDate = now.toLocaleDateString('en-US', {
    timeZone: userTimezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const todayDateStr = getDateStringInTimezone(now, userTimezone)
  const currentTimeStr = now.toLocaleTimeString('en-US', {
    timeZone: userTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const beyondLine =
    tasksBeyondWindow > 0 ? `\n(${tasksBeyondWindow} tasks beyond this window)` : ''

  return `
You are Harvey, an AI project coach. You help ${user.name || 'the user'} stay on track with their project by managing their schedule, providing advice, and acting as an accountability partner.

## Your personality
- Direct and action-oriented. You give clear direction, not vague suggestions.
- Encouraging but honest. Celebrate wins, acknowledge struggles, don't sugarcoat.
- You speak like a knowledgeable friend who happens to be great at project management.
- Keep messages concise. 2-4 sentences for simple responses. Longer only when the user asks for detailed advice.
- Use the user's name occasionally but not every message.

## Current context
- Current date and time: ${localDate}, ${localTime} (timezone: ${userTimezone})
- Today's date in user's timezone: ${todayDateStr}
- Current time in user's timezone: ${currentTimeStr}
- User: ${user.name || 'User'}

## Project information
- Title: ${project.title}
- Description: ${project.description || 'No description'}
- Goals: ${project.goals || 'No specific goals set'}
- Status: ${project.status}
- Current schedule batch: #${stats.currentBatch} (${(project as Project & { generationCount?: number }).generationCount || 1} total generations)

## User constraints
${formatConstraints(contextData)}

## Current schedule (today + next 7 days; all times ${userTimezone})
${formatTasks(stats.todayTasks, 'today', userTimezone)}
${formatAllTasks(scheduleTasks, userTimezone)}${beyondLine}

## Progress stats
- Overall: ${stats.completed}/${stats.total} tasks completed (${stats.completionRate}% completion rate)
- Skipped: ${stats.skipped} tasks
- Pending: ${stats.pending} tasks
${stats.avgAccuracy ? `- Time estimation accuracy: tasks take ${Math.round(stats.avgAccuracy * 100)}% of estimated time on average` : ''}
${Object.keys(stats.skipReasons).length > 0 ? `- Common skip reasons: ${Object.entries(stats.skipReasons).map(([reason, count]) => `${reason} (${count}x)`).join(', ')}` : ''}

## Harvey's notes about this user
${(project as Project & { projectNotes?: string }).projectNotes || 'No notes yet — this is a new user.'}

## Your capabilities
You can respond in two ways:

1. **Use a tool** when the user wants to change something (modify tasks, update constraints, add tasks, reschedule, etc.). Call the appropriate tool, wait for the result, then explain what you did.

2. **Respond conversationally** when the user asks questions, seeks advice, wants to discuss strategy, or is just chatting. Use the project context above to give informed, personalized answers. You are a knowledgeable coach — give real advice about their project domain when you can.

IMPORTANT: Not every message needs a tool. If the user is asking a question or having a conversation, just respond. Only call tools when the user wants you to DO something to their schedule or data.

IMPORTANT: When you use a tool, ALWAYS explain what you did in plain language after the tool executes. Don't just silently make changes.

IMPORTANT: After regenerate_schedule, use the tool result message to give a brief, clear recap: what changed (e.g. how many tasks moved, new completion date). Keep it to 2–3 sentences so the user understands at a glance.

IMPORTANT: After updating constraints, ask the user if they want you to rebuild the schedule with the new constraints.

IMPORTANT: When calling update_project_notes, only do so when you learn something genuinely new and important about the user's preferences, patterns, or project direction. Do NOT call it on every message.
`.trim()
}

// ============================================
// Helper Formatting Functions
// ============================================

/**
 * Format user constraints (availability, blocked time, one-off blocks) for the system prompt.
 */
function formatConstraints(contextData: ContextData): string {
  let result = ''

  if (contextData.available_time?.length) {
    result += 'Available time:\n'
    contextData.available_time.forEach((slot) => {
      result += `  - ${slot.day}: ${slot.start}–${slot.end}${slot.label ? ` (${slot.label})` : ''}\n`
    })
  }

  if (contextData.blocked_time?.length) {
    result += 'Blocked time:\n'
    contextData.blocked_time.forEach((slot) => {
      result += `  - ${slot.day}: ${slot.start}–${slot.end}${slot.label ? ` (${slot.label})` : ''}\n`
    })
  }

  if (contextData.one_off_blocks?.length) {
    // Only show future one-off blocks
    const future = contextData.one_off_blocks.filter(
      (b) => new Date(b.date || b.date_end || '') >= new Date()
    )
    if (future.length) {
      result += 'Temporary blocks:\n'
      future.forEach((block) => {
        if (block.all_day) {
          result += `  - ${block.date}: All day${block.reason ? ` (${block.reason})` : ''}\n`
        } else {
          result += `  - ${block.date}: ${block.start_time}–${block.end_time}${block.reason ? ` (${block.reason})` : ''}\n`
        }
      })
    }
  }

  if (contextData.preferences && Object.keys(contextData.preferences).length > 0) {
    result += 'Preferences:\n'
    Object.entries(contextData.preferences).forEach(([key, value]) => {
      result += `  - ${key}: ${value}\n`
    })
  }

  return result || 'No constraints set.'
}

/**
 * One compact line per task for smaller token usage.
 * Format: "Feb 9 20:00–22:00 | id:abc | Title | 2h | pending | →dep1,dep2"
 */
function formatTaskLineCompact(task: Task, userTimezone: string): string {
  const taskExt = task as unknown as { depends_on?: string[] }
  const deps =
    taskExt.depends_on?.length ? ` | →${taskExt.depends_on.join(',')}` : ''
  const dur =
    task.estimatedDuration >= 60
      ? `${Math.floor(task.estimatedDuration / 60)}h`
      : `${task.estimatedDuration}min`
  const status =
    task.status === 'completed' ? 'done' : task.status === 'skipped' ? 'skipped' : 'pending'

  let dateTime: string
  if (!task.scheduledDate) {
    dateTime = 'unscheduled'
  } else {
    const shortDate = task.scheduledDate.toLocaleDateString('en-US', {
      timeZone: userTimezone,
      month: 'short',
      day: 'numeric',
    })
    if (task.scheduledStartTime && task.scheduledEndTime) {
      dateTime = `${shortDate} ${formatTime(task.scheduledStartTime, userTimezone)}–${formatTime(task.scheduledEndTime, userTimezone)}`
    } else {
      dateTime = shortDate
    }
  }
  return `  ${dateTime} | id:${task.id} | ${task.title} | ${dur} | ${status}${deps}`
}

/**
 * Short date header in user TZ (e.g. "Mon Feb 9").
 */
function formatDateShortInTimezone(utcDate: Date, userTimezone: string): string {
  return utcDate.toLocaleDateString('en-US', {
    timeZone: userTimezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format a list of tasks for a specific period (e.g., "today") using compact lines.
 */
function formatTasks(tasks: Task[], label: string, userTimezone: string): string {
  if (!tasks.length) return `No tasks ${label}.`

  let result = `Tasks ${label}:\n`
  tasks
    .sort((a, b) =>
      (a.scheduledStartTime?.toISOString() || '').localeCompare(
        b.scheduledStartTime?.toISOString() || ''
      )
    )
    .forEach((task) => {
      result += formatTaskLineCompact(task, userTimezone) + '\n'
    })
  return result
}

/**
 * Format tasks grouped by date for the full schedule view (compact lines, short date headers).
 */
function formatAllTasks(tasks: Task[], userTimezone: string): string {
  const grouped = tasks.reduce(
    (acc, task) => {
      const date =
        task.scheduledDate != null
          ? getDateStringInTimezone(task.scheduledDate, userTimezone)
          : 'unscheduled'
      if (!acc[date]) acc[date] = []
      acc[date].push(task)
      return acc
    },
    {} as Record<string, Task[]>
  )

  let result = 'Full schedule:\n'
  Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([dateStr, dateTasks]) => {
      const header =
        dateStr === 'unscheduled'
          ? dateStr
          : (() => {
              const firstTask = dateTasks[0]
              const d = firstTask?.scheduledDate
              return d ? formatDateShortInTimezone(d, userTimezone) : dateStr
            })()
      result += `\n  ${header}:\n`
      dateTasks
        .sort((a, b) =>
          (a.scheduledStartTime?.toISOString() || '').localeCompare(
            b.scheduledStartTime?.toISOString() || ''
          )
        )
        .forEach((task) => {
          result += formatTaskLineCompact(task, userTimezone) + '\n'
        })
    })
  return result
}

/**
 * Format a UTC DateTime to a time string (HH:MM) in the user's timezone.
 */
function formatTime(date: Date, userTimezone: string): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: userTimezone,
  })
}
