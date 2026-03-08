/**
 * Tool: update_constraints
 *
 * Update user availability or scheduling constraints.
 * Persists to User (availabilityWindows, oneOffBlocks, energy_peak, rest_days), not contextData.
 */

import { prisma } from '../../db/prisma'
import { updateUser, getUserById } from '../../users/user-service'
import type { UpdateConstraintsResult, OneOffBlock, TimeBlockEntry } from '../types'

type AvailabilityWindow = { days: string[]; start_time: string; end_time: string; type: string; window_type: 'fixed' }

function availabilityWindowsToBlocks(windows: unknown): TimeBlockEntry[] {
  if (!Array.isArray(windows) || windows.length === 0) return []
  const blocks: TimeBlockEntry[] = []
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  for (const w of windows) {
    const days = Array.isArray((w as { days?: string[] }).days) ? (w as { days: string[] }).days : []
    const start = typeof (w as { start_time?: string }).start_time === 'string' ? (w as { start_time: string }).start_time : '09:00'
    const end = typeof (w as { end_time?: string }).end_time === 'string' ? (w as { end_time: string }).end_time : '17:00'
    for (const d of days) {
      const day = String(d).toLowerCase()
      if (dayNames.includes(day)) blocks.push({ day, start, end })
    }
  }
  return blocks
}

function blocksToAvailabilityWindows(blocks: TimeBlockEntry[]): AvailabilityWindow[] {
  if (!blocks.length) return []
  const byKey = new Map<string, string[]>()
  for (const b of blocks) {
    const key = `${b.start}-${b.end}`
    const day = b.day.toLowerCase()
    if (!byKey.has(key)) byKey.set(key, [])
    const days = byKey.get(key)!
    if (!days.includes(day)) days.push(day)
  }
  return Array.from(byKey.entries()).map(([key, days]) => {
    const [start_time, end_time] = key.split('-')
    return { days: days.sort(), start_time, end_time, type: 'work_on_project', window_type: 'fixed' as const }
  })
}

interface UpdateConstraintsParams {
  change_type: 'permanent' | 'one_off'
  action: 'add' | 'remove' | 'modify'
  constraint_type: 'available_time' | 'blocked_time' | 'preference'
  description: string
  date?: string        // YYYY-MM-DD for one-off
  date_start?: string  // range start
  date_end?: string    // range end
  time_start?: string  // HH:MM
  time_end?: string    // HH:MM
  all_day?: boolean
}

// Days of the week for matching
const ALL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_ALIASES: Record<string, string> = {
  mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday',
  fri: 'friday', sat: 'saturday', sun: 'sunday',
  mondays: 'monday', tuesdays: 'tuesday', wednesdays: 'wednesday',
  thursdays: 'thursday', fridays: 'friday', saturdays: 'saturday', sundays: 'sunday',
}

/**
 * Extract day name(s) from a description string.
 */
function extractDays(description: string): string[] {
  const lower = description.toLowerCase()
  const found: string[] = []

  for (const day of ALL_DAYS) {
    if (lower.includes(day)) found.push(day)
  }
  // Check aliases too
  for (const [alias, day] of Object.entries(DAY_ALIASES)) {
    if (lower.includes(alias) && !found.includes(day)) {
      found.push(day)
    }
  }
  return found
}

/**
 * Execute the update_constraints tool.
 * Persists to User (availabilityWindows, oneOffBlocks, energy_peak, rest_days).
 */
export async function executeUpdateConstraints(
  params: UpdateConstraintsParams,
  projectId: string,
  userId: string
): Promise<UpdateConstraintsResult> {
  try {
    const { change_type, action, constraint_type, description } = params

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    })
    if (!project) {
      return { success: false, message: 'Project not found.', affected_tasks_count: 0 }
    }

    const user = await getUserById(userId)
    if (!user) {
      return { success: false, message: 'User not found.', affected_tasks_count: 0 }
    }

    if (change_type === 'permanent' && constraint_type === 'blocked_time') {
      return {
        success: true,
        message: "To change your work schedule or commute, please go to Settings (gear icon in the dashboard) and update the Work Schedule section. I've noted your preference for the conversation.",
        affected_tasks_count: 0,
      }
    }

    if (change_type === 'one_off') {
      const block: OneOffBlock = {
        date: params.date || new Date().toISOString().split('T')[0],
        date_start: params.date_start,
        date_end: params.date_end,
        start_time: params.time_start,
        end_time: params.time_end,
        all_day: params.all_day ?? (!params.time_start && !params.time_end),
        reason: description,
      }
      let oneOffBlocks = (Array.isArray(user.oneOffBlocks) ? user.oneOffBlocks : []) as OneOffBlock[]
      if (action === 'add') {
        oneOffBlocks = [...oneOffBlocks, block]
      } else if (action === 'remove') {
        oneOffBlocks = oneOffBlocks.filter((b) => b.date !== block.date)
      } else if (action === 'modify') {
        const idx = oneOffBlocks.findIndex((b) => b.date === block.date)
        if (idx >= 0) {
          oneOffBlocks = oneOffBlocks.slice()
          oneOffBlocks[idx] = block
        } else {
          oneOffBlocks = [...oneOffBlocks, block]
        }
      }
      const result = await updateUser(userId, { oneOffBlocks })
      if (!result.success) {
        return { success: false, message: result.error?.message ?? 'Failed to update.', affected_tasks_count: 0 }
      }
    }

    if (change_type === 'permanent') {
      const days = extractDays(description)

      if (constraint_type === 'preference') {
        const lower = description.toLowerCase()
        if (/\b(morning|afternoon|evening|mornings|afternoons|evenings)\b/.test(lower)) {
          const map: Record<string, string> = { morning: 'mornings', mornings: 'mornings', afternoon: 'afternoons', afternoons: 'afternoons', evening: 'evenings', evenings: 'evenings' }
          const match = lower.match(/\b(morning|afternoon|evening)s?\b/)
          const value = match ? map[match[1]] ?? user.energy_peak ?? undefined : undefined
          if (value && (action === 'add' || action === 'modify')) {
            await updateUser(userId, { energy_peak: value })
          }
        } else if (days.length > 0) {
          const rest_days = (user.rest_days ?? []).slice()
          if (action === 'add' || action === 'modify') {
            for (const d of days) {
              const day = d.toLowerCase()
              if (!rest_days.includes(day)) rest_days.push(day)
            }
            await updateUser(userId, { rest_days })
          } else if (action === 'remove') {
            const next = rest_days.filter((d) => !days.includes(d.toLowerCase()))
            await updateUser(userId, { rest_days: next })
          }
        }
      } else if (constraint_type === 'available_time') {
        let blocks = availabilityWindowsToBlocks(user.availabilityWindows)
        if (action === 'remove' && days.length > 0) {
          blocks = blocks.filter((entry) => !days.includes(entry.day.toLowerCase()))
        } else if (action === 'add') {
          if (days.length > 0 && params.time_start && params.time_end) {
            for (const day of days) {
              blocks.push({
                day,
                start: params.time_start,
                end: params.time_end,
                label: description.substring(0, 50),
              })
            }
          } else if (days.length > 0) {
            for (const day of days) {
              blocks.push({ day, start: '09:00', end: '22:00', label: description.substring(0, 50) })
            }
          } else {
            return {
              success: false,
              message: "I couldn't figure out which days to change. Can you be more specific? For example: 'Add Saturday morning 10am-2pm'.",
              affected_tasks_count: 0,
            }
          }
        } else if (action === 'modify' && days.length > 0) {
          blocks = blocks.map((entry) => {
            if (days.includes(entry.day.toLowerCase())) {
              return {
                ...entry,
                start: params.time_start || entry.start,
                end: params.time_end || entry.end,
              }
            }
            return entry
          })
        }
        const availabilityWindows = blocksToAvailabilityWindows(blocks)
        const result = await updateUser(userId, { availabilityWindows })
        if (!result.success) {
          return { success: false, message: result.error?.message ?? 'Failed to update.', affected_tasks_count: 0 }
        }
      }
    }

    const pendingTasks = await prisma.task.count({
      where: { projectId, status: 'pending' },
    })
    return {
      success: true,
      message: `Constraints updated: ${description}. ${pendingTasks} pending task(s) may be affected.`,
      affected_tasks_count: pendingTasks,
    }
  } catch (error) {
    console.error('[updateConstraints] Error:', error)
    return {
      success: false,
      message: `Failed to update constraints: ${error instanceof Error ? error.message : 'Unknown error'}`,
      affected_tasks_count: 0,
    }
  }
}
