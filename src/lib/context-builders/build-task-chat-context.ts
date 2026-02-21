/**
 * Task Chat Context Assembly
 *
 * Builds the system prompt for per-task chat (Harvey as accountability coach for a single task).
 * Called on every message; no caching. Five layers: project, current task, dependencies,
 * schedule context, behavioral patterns.
 *
 * On Prisma failure: returns a minimal fallback prompt and never throws.
 */

import { prisma } from '../db/prisma'

/** Minimal fallback when context cannot be loaded */
function fallbackPrompt(taskTitle: string): string {
  return `You are Harvey, an AI accountability coach. Context for this task is temporarily unavailable.
Current task: ${taskTitle}
Help the user with this task in a direct, concise way. If they ask about dependencies or schedule, ask them to try again in a moment.`
}

function formatDate(d: Date | null): string {
  if (!d) return 'Not scheduled'
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDeadline(d: Date | null): string {
  if (!d) return 'No deadline set'
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** successCriteria is Json (array of {id, text, done}); render briefly */
function formatSuccessCriteria(json: unknown): string {
  if (json == null) return 'Not defined'
  if (!Array.isArray(json)) return 'Not defined'
  const items = json
    .map((item) => (typeof item === 'object' && item != null && 'text' in item ? String((item as { text: unknown }).text) : null))
    .filter(Boolean)
  return items.length > 0 ? items.join('; ') : 'Not defined'
}

export async function buildTaskChatContext(
  taskId: string,
  userId: string
): Promise<string> {
  try {
    const task = await prisma.task.findFirst({
      where: { id: taskId },
      include: {
        project: {
          include: {
            user: {
              select: {
                timezone: true,
                availabilityWindows: true,
                workSchedule: true,
                commute: true,
              },
            },
          },
        },
      },
    })

    if (!task || !task.projectId || !task.project) {
      return fallbackPrompt('Unknown task')
    }

    const project = task.project
    const projectId = task.projectId

    // Ownership: only include context for this user's project
    if (project.userId !== userId) {
      return fallbackPrompt(task.title)
    }

    // 1) Dependency tasks
    const dependencyTasks =
      task.depends_on.length > 0
        ? await prisma.task.findMany({
            where: { id: { in: task.depends_on } },
            select: { id: true, title: true, status: true, estimatedDuration: true },
          })
        : []

    // 2) Downstream tasks (what this task unlocks)
    const downstreamTasks = await prisma.task.findMany({
      where: { depends_on: { has: taskId } },
      select: { id: true, title: true, status: true },
    })

    // 3) Recent tasks (last 7 days)
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const recentTasks = await prisma.task.findMany({
      where: {
        projectId,
        scheduledDate: {
          gte: sevenDaysAgo,
          lte: now,
        },
      },
      orderBy: { scheduledDate: 'desc' },
      take: 5,
      select: {
        title: true,
        status: true,
        scheduledDate: true,
        estimatedDuration: true,
        actualDuration: true,
        label: true,
      },
    })

    // 4) Upcoming tasks (after now, pending)
    const upcomingTasks = await prisma.task.findMany({
      where: {
        projectId,
        scheduledDate: { gt: now },
        status: 'pending',
      },
      orderBy: { scheduledDate: 'asc' },
      take: 5,
      select: {
        title: true,
        scheduledDate: true,
        estimatedDuration: true,
        label: true,
      },
    })

    // 5) Completed tasks for behavioral patterns (estimation accuracy)
    const completedTasksRaw = await prisma.task.findMany({
      where: {
        projectId,
        status: 'completed',
      },
      select: {
        estimatedDuration: true,
        actualDuration: true,
        label: true,
      },
    })
    const completedTasks = completedTasksRaw.filter(
      (t): t is typeof t & { actualDuration: number } =>
        t.actualDuration != null && t.estimatedDuration != null
    )

    // 6) Skipped tasks for skip patterns (most common skip_reason)
    const skippedTasksRaw = await prisma.task.findMany({
      where: {
        projectId,
        status: 'skipped',
      },
      select: { skipReason: true },
    })
    const skippedTasks = skippedTasksRaw.filter(
      (t): t is typeof t & { skipReason: string } => t.skipReason != null && t.skipReason !== ''
    )

    // --- Build sections ---

    const projectTitle = project.title ?? 'Untitled'
    const projectDesc = project.description ?? 'Not specified'
    const goals = project.goals ?? 'Not specified'
    const deadline = formatDeadline(project.target_deadline ?? null)
    const techStack =
      Array.isArray(project.tools_and_stack) && project.tools_and_stack.length > 0
        ? project.tools_and_stack.join(', ')
        : 'Not specified'
    const skillLevel = project.skill_level ?? 'Not specified'
    const weeklyHours =
      project.weekly_hours_commitment != null
        ? `${project.weekly_hours_commitment} hours/week`
        : 'Not specified'

    const taskEstimated =
      task.estimatedDuration != null
        ? `${task.estimatedDuration} minutes`
        : 'Not specified'
    const taskScheduled = formatDate(task.scheduledDate ?? null)
    const taskDesc = task.description ?? 'No description'
    const successCriteria = formatSuccessCriteria(task.successCriteria)

    const depsList =
      dependencyTasks.length === 0
        ? '- None'
        : dependencyTasks.map((t) => `- ${t.title} (${t.status})`).join('\n')
    const incompleteDeps = dependencyTasks.filter((t) => t.status !== 'completed')
    const incompleteDepsList =
      incompleteDeps.length === 0
        ? 'None — all dependencies are complete'
        : incompleteDeps.map((t) => `- ${t.title} (${t.status})`).join('\n')
    const downstreamList =
      downstreamTasks.length === 0
        ? '- No downstream tasks'
        : downstreamTasks.map((t) => `- ${t.title}`).join('\n')

    const recentList =
      recentTasks.length === 0
        ? '- No recent tasks'
        : recentTasks
            .map(
              (t) =>
                `- ${t.title} (${t.status}, ${t.label ?? 'no label'})`
            )
            .join('\n')
    const upcomingList =
      upcomingTasks.length === 0
        ? '- Nothing scheduled after this task'
        : upcomingTasks
            .map(
              (t) =>
                `- ${t.title} on ${formatDate(t.scheduledDate)}, ${t.estimatedDuration}min`
            )
            .join('\n')

    // Behavioral patterns: estimation accuracy by label (2+ data points)
    let estimationBlock = 'Not enough data yet'
    if (completedTasks.length >= 2) {
      const byLabel: Record<
        string,
        { estimated: number; actual: number; count: number }
      > = {}
      for (const t of completedTasks) {
        const label = t.label ?? 'Uncategorized'
        if (!byLabel[label]) {
          byLabel[label] = { estimated: 0, actual: 0, count: 0 }
        }
        byLabel[label].estimated += t.estimatedDuration
        byLabel[label].actual += t.actualDuration!
        byLabel[label].count += 1
      }
      const lines: string[] = []
      for (const [label, data] of Object.entries(byLabel)) {
        if (data.count < 2) continue
        const ratio = data.actual / data.estimated
        if (ratio > 1.2) {
          const pct = Math.round((ratio - 1) * 100)
          lines.push(
            `For ${label} tasks, user typically takes ${pct}% more time than estimated.`
          )
        } else if (ratio < 0.8) {
          const pct = Math.round((1 - ratio) * 100)
          lines.push(
            `For ${label} tasks, user typically takes ${pct}% less time than estimated.`
          )
        } else {
          lines.push(`For ${label} tasks, user is roughly on track with estimates.`)
        }
      }
      if (lines.length > 0) {
        estimationBlock = lines.join('\n')
        const currentLabel = task.label ?? 'Uncategorized'
        const currentData = byLabel[currentLabel]
        if (currentData && currentData.count >= 2) {
          const ratio = currentData.actual / currentData.estimated
          if (ratio > 1.2) {
            const pct = Math.round((ratio - 1) * 100)
            estimationBlock += `\nNote: This is a ${currentLabel} task — user tends to underestimate by ${pct}%.`
          } else if (ratio < 0.8) {
            const pct = Math.round((1 - ratio) * 100)
            estimationBlock += `\nNote: This is a ${currentLabel} task — user tends to overestimate by ${pct}%.`
          }
        }
      }
    }

    // Skip patterns (from skipped tasks)
    let skipBlock = 'No skip patterns detected'
    if (skippedTasks.length > 0) {
      const counts: Record<string, number> = {}
      for (const t of skippedTasks) {
        const r = (t.skipReason ?? 'other').trim() || 'other'
        counts[r] = (counts[r] ?? 0) + 1
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
      if (sorted.length > 0) {
        skipBlock = `Most common reason for skipping: ${sorted[0][0]}`
      }
    }

    const systemPrompt = `---
You are Harvey, an AI accountability coach. Your role is to help the user execute this specific task. Be direct, specific, and genuinely useful. Use the context below to give personalized advice.

=== PROJECT CONTEXT ===
Project: ${projectTitle}
Description: ${projectDesc}
Goals: ${goals}
Deadline: ${deadline}
Tech stack: ${techStack}
Skill level: ${skillLevel}
Weekly hours committed: ${weeklyHours}

=== CURRENT TASK ===
Title: ${task.title}
Category: ${task.label ?? 'Uncategorized'}
Status: ${task.status}
Estimated duration: ${taskEstimated}
Scheduled: ${taskScheduled}
Description: ${taskDesc}
Success criteria: ${successCriteria}

=== DEPENDENCIES ===
This task depends on:
${depsList}

Incomplete dependencies (flag these):
${incompleteDepsList}

This task unlocks:
${downstreamList}

=== SCHEDULE CONTEXT ===
Recent work (last 7 days):
${recentList}

Coming up after this task:
${upcomingList}

=== BEHAVIORAL PATTERNS ===
Time estimation accuracy:
${estimationBlock}

Skip patterns:
${skipBlock}

---
Focus entirely on helping the user execute THIS task. Do not reschedule, do not discuss other tasks unless directly asked.
Keep responses concise and actionable.
---
`

    return systemPrompt
  } catch (err) {
    console.error('[buildTaskChatContext] Error building context:', err)
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { title: true },
      })
      return fallbackPrompt(task?.title ?? 'This task')
    } catch {
      return fallbackPrompt('This task')
    }
  }
}
