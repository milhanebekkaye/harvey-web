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
import { buildContextDataFromProjectAndUser } from '../schedule/schedule-generation'
import type { Task, Project, TaskStats, ContextData } from './types'
import type { User } from '@prisma/client'

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

  // 2. Fetch user (for timezone, name, constraints)
  // Use explicit select so we only query columns that exist in the base schema.
  // Enrichment columns (preferred_session_length, communication_style, userNotes) may be missing
  // if migration 20260211120000_add_project_user_enrichment_fields has not been applied.
  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      timezone: true,
      workSchedule: true,
      commute: true,
      availabilityWindows: true,
      oneOffBlocks: true,
      rest_days: true,
      energy_peak: true,
    },
  })

  if (!user) {
    console.warn('[assembleContext] User not found in DB, using minimal context for', userId.slice(0, 8))
    user = {
      id: userId,
      name: null,
      timezone: 'Europe/Paris',
      workSchedule: null,
      commute: null,
      availabilityWindows: null,
      oneOffBlocks: null,
      rest_days: [],
      energy_peak: null,
    }
  }
  // userNotes not selected above (may not exist in DB); buildSystemPrompt treats undefined as no notes
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
/** Minimal user shape needed for the system prompt (we only select a subset in the query). */
function buildSystemPrompt(
  project: Project & { tasks: Task[] },
  user: Pick<User, 'id' | 'name' | 'timezone' | 'workSchedule' | 'commute'>,
  stats: TaskStats,
  scheduleTasks: Task[],
  tasksBeyondWindow: number,
  userTimezone: string
): string {
  const contextData = buildContextDataFromProjectAndUser(project, user)

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

  const projectWithEnrichment = project as Project & {
    target_deadline?: Date | null
    skill_level?: string | null
    tools_and_stack?: string[]
    project_type?: string | null
    weekly_hours_commitment?: number | null
    motivation?: string | null
    phases?: { phases: Array<{ title?: string; goal?: string | null }>; active_phase_id?: number } | null
    projectNotes?: unknown
    generationCount?: number
  }
  const userWithNotes = user as User & { userNotes?: unknown }

  const projectContextSection = formatProjectContext(projectWithEnrichment)
  const projectNotesSection = formatNotesSection(projectWithEnrichment.projectNotes, 'project')
  const userNotesSection = formatNotesSection(userWithNotes.userNotes, 'user')

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

${projectContextSection}

## Project information
- Title: ${project.title}
- Description: ${project.description || 'No description'}
- Goals: ${project.goals || 'No specific goals set'}
- Status: ${project.status}
- Current schedule batch: #${stats.currentBatch} (${projectWithEnrichment.generationCount || 1} total generations)

${projectNotesSection}
${userNotesSection}

## User constraints
${formatConstraints(contextData, user as unknown as UserLifeConstraints)}

## Current schedule (today + next 7 days; all times ${userTimezone})
${formatTasks(stats.todayTasks, 'today', userTimezone)}
${formatAllTasks(scheduleTasks, userTimezone)}${beyondLine}

## Progress stats
- Overall: ${stats.completed}/${stats.total} tasks completed (${stats.completionRate}% completion rate)
- Skipped: ${stats.skipped} tasks
- Pending: ${stats.pending} tasks
${stats.avgAccuracy ? `- Time estimation accuracy: tasks take ${Math.round(stats.avgAccuracy * 100)}% of estimated time on average` : ''}
${Object.keys(stats.skipReasons).length > 0 ? `- Common skip reasons: ${Object.entries(stats.skipReasons).map(([reason, count]) => `${reason} (${count}x)`).join(', ')}` : ''}

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
 * Format project context (enrichment fields) for the system prompt.
 * Omits any line whose value is null/undefined/empty.
 */
function formatProjectContext(project: {
  project_type?: string | null
  phases?: { phases: Array<{ title?: string; goal?: string | null }>; active_phase_id?: number } | null
  target_deadline?: Date | null
  skill_level?: string | null
  tools_and_stack?: string[]
  weekly_hours_commitment?: number | null
  motivation?: string | null
}): string {
  const lines: string[] = []
  if (project.project_type != null && project.project_type !== '') {
    lines.push(`- Type: ${project.project_type}`)
  }
  if (project.phases?.phases?.length) {
    const activeId = project.phases.active_phase_id
    const phasesWithId = project.phases.phases as Array<{ id?: number; title?: string; goal?: string | null }>
    const active = phasesWithId.find((p) => p.id === activeId) ?? phasesWithId[0]
    if (active?.title) lines.push(`- Phase: ${active.title}${active.goal ? ` — ${active.goal}` : ''}`)
  }
  if (project.target_deadline != null) {
    const d = project.target_deadline instanceof Date ? project.target_deadline : new Date(project.target_deadline)
    lines.push(`- Deadline: ${d.toISOString().split('T')[0]}`)
  }
  if (project.skill_level != null && project.skill_level !== '') {
    lines.push(`- Skill level: ${project.skill_level}`)
  }
  if (project.tools_and_stack != null && project.tools_and_stack.length > 0) {
    lines.push(`- Stack: ${project.tools_and_stack.join(', ')}`)
  }
  if (project.weekly_hours_commitment != null) {
    lines.push(`- Weekly commitment: ${project.weekly_hours_commitment}h/week`)
  }
  if (project.motivation != null && project.motivation !== '') {
    lines.push(`- Motivation: ${project.motivation}`)
  }
  if (lines.length === 0) return ''
  return `## Project Context\n${lines.join('\n')}\n`
}

/**
 * Format projectNotes or userNotes (JSON array or legacy string) as bullet list.
 */
function formatNotesSection(notes: unknown, kind: 'project' | 'user'): string {
  const title = kind === 'project' ? 'What Harvey knows about this project' : 'What Harvey knows about this person'
  if (notes == null) return `## ${title}\nNo notes yet.\n\n`
  if (Array.isArray(notes) && notes.length > 0) {
    const bullets = notes
      .map((entry) => (typeof entry === 'object' && entry != null && 'note' in entry ? String((entry as { note: string }).note) : null))
      .filter((n): n is string => n != null && n !== '')
    if (bullets.length === 0) return `## ${title}\nNo notes yet.\n\n`
    return `## ${title}\n${bullets.map((b) => `- ${b}`).join('\n')}\n\n`
  }
  if (typeof notes === 'string' && notes.trim() !== '') {
    return `## ${title}\n- ${notes}\n\n`
  }
  return `## ${title}\nNo notes yet.\n\n`
}

/** User work schedule / commute shape (from User model). */
interface UserLifeConstraints {
  workSchedule?:
    | { workDays?: number[]; startTime?: string; endTime?: string; blocks?: Array<{ days: number[]; startTime: string; endTime: string }> }
    | null
  commute?: {
    morning?: { durationMinutes?: number; startTime?: string }
    evening?: { durationMinutes?: number; startTime?: string }
  } | null
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Format user constraints (availability, work schedule, commute, one-off blocks) for the system prompt.
 * Blocked time comes from User.workSchedule and User.commute, not contextData.
 */
function formatConstraints(contextData: ContextData, user?: UserLifeConstraints | null): string {
  let result = ''

  const ws = user?.workSchedule
  if (Array.isArray(ws?.blocks) && ws.blocks.length > 0) {
    result += 'Work schedule:\n'
    ws.blocks.forEach((b: { days?: number[]; startTime: string; endTime: string }) => {
      const days = (Array.isArray(b.days) && b.days.length > 0 ? b.days : ws.workDays ?? [1, 2, 3, 4, 5])
        .map((d: number) => DAY_NAMES[d] ?? d)
        .join(', ')
      result += `  ${days}: ${b.startTime}–${b.endTime}\n`
    })
  } else if (ws?.workDays?.length && ws.startTime && ws.endTime) {
    const days = ws.workDays.map((d) => DAY_NAMES[d] ?? d).join(', ')
    result += `Work schedule: ${days} ${ws.startTime}–${ws.endTime}\n`
  }
  if (user?.commute?.morning || user?.commute?.evening) {
    if (user.commute.morning) {
      result += `Commute (morning): ${user.commute.morning.startTime}, ${user.commute.morning.durationMinutes} min\n`
    }
    if (user.commute.evening) {
      result += `Commute (evening): ${user.commute.evening.startTime}, ${user.commute.evening.durationMinutes} min\n`
    }
  }

  if (contextData.available_time?.length) {
    result += 'Available time (for this project):\n'
    contextData.available_time.forEach((slot) => {
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
