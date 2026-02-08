/**
 * Tool: update_constraints
 *
 * Update user availability or scheduling constraints.
 * Handles both permanent recurring changes and one-off temporary blocks.
 *
 * After updating, the tool reports how many pending tasks are affected,
 * and Claude should ask the user if they want to rebuild the schedule.
 */

import { prisma } from '../../db/prisma'
import type { UpdateConstraintsResult, ContextData, OneOffBlock, TimeBlockEntry } from '../types'

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
 *
 * Modifies the project's contextData based on the change requested.
 * Handles permanent (recurring) changes and one-off (date-specific) blocks.
 *
 * @param params - Tool parameters from Claude
 * @param projectId - The project UUID
 * @param userId - The authenticated user UUID
 * @returns Result with success status and affected task count
 */
export async function executeUpdateConstraints(
  params: UpdateConstraintsParams,
  projectId: string,
  userId: string
): Promise<UpdateConstraintsResult> {
  try {
    const { change_type, action, constraint_type, description } = params

    // 1. Fetch the project's contextData
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    })

    if (!project) {
      return { success: false, message: 'Project not found.', affected_tasks_count: 0 }
    }

    const contextData: ContextData = (project.contextData as unknown as ContextData) || {
      available_time: [],
      blocked_time: [],
      preferences: {},
    }

    // Ensure arrays exist
    if (!contextData.available_time) contextData.available_time = []
    if (!contextData.blocked_time) contextData.blocked_time = []
    if (!contextData.one_off_blocks) contextData.one_off_blocks = []
    if (!contextData.preferences) contextData.preferences = {}

    // 2. Handle one-off blocks
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

      if (action === 'add') {
        contextData.one_off_blocks.push(block)
      } else if (action === 'remove') {
        contextData.one_off_blocks = contextData.one_off_blocks.filter(
          (b) => b.date !== block.date
        )
      } else if (action === 'modify') {
        const idx = contextData.one_off_blocks.findIndex((b) => b.date === block.date)
        if (idx >= 0) {
          contextData.one_off_blocks[idx] = block
        } else {
          contextData.one_off_blocks.push(block)
        }
      }
    }

    // 3. Handle permanent changes
    if (change_type === 'permanent') {
      const days = extractDays(description)

      if (constraint_type === 'preference') {
        // Handle preference changes
        if (action === 'add' || action === 'modify') {
          // Store the preference description as-is
          contextData.preferences[description.substring(0, 50)] = description
        } else if (action === 'remove') {
          // Try to find and remove a matching preference key
          for (const key of Object.keys(contextData.preferences)) {
            if (key.toLowerCase().includes(description.toLowerCase().substring(0, 20))) {
              delete contextData.preferences[key]
              break
            }
          }
        }
      } else if (constraint_type === 'available_time' || constraint_type === 'blocked_time') {
        const targetArray = constraint_type === 'available_time'
          ? contextData.available_time
          : contextData.blocked_time
        const otherArray = constraint_type === 'available_time'
          ? contextData.blocked_time
          : contextData.available_time

        if (action === 'remove' && days.length > 0) {
          // Remove the specified days from the target constraint type
          // For available_time: filter entries that match the day(s)
          if (constraint_type === 'available_time') {
            contextData.available_time = contextData.available_time.filter(
              (entry) => !days.includes(entry.day.toLowerCase())
            )
            // Also add these days as blocked if not already
            for (const day of days) {
              const alreadyBlocked = contextData.blocked_time.some(
                (b) => b.day.toLowerCase() === day
              )
              if (!alreadyBlocked) {
                contextData.blocked_time.push({
                  day,
                  start: '00:00',
                  end: '23:59',
                  label: `Blocked (${description})`,
                })
              }
            }
          } else {
            contextData.blocked_time = contextData.blocked_time.filter(
              (entry) => !days.includes(entry.day.toLowerCase())
            )
          }
        } else if (action === 'add') {
          // Add new time entries
          if (days.length > 0 && params.time_start && params.time_end) {
            for (const day of days) {
              const newEntry: TimeBlockEntry = {
                day,
                start: params.time_start,
                end: params.time_end,
                label: description.substring(0, 50),
              }
              targetArray.push(newEntry)
            }
          } else if (days.length > 0) {
            // Days specified but no time — block/free entire day
            for (const day of days) {
              if (constraint_type === 'available_time') {
                targetArray.push({ day, start: '09:00', end: '22:00', label: description.substring(0, 50) })
              } else {
                targetArray.push({ day, start: '00:00', end: '23:59', label: description.substring(0, 50) })
              }
            }
          } else {
            return {
              success: false,
              message: "I couldn't figure out which days to change. Can you be more specific? For example: 'Block Fridays' or 'Add Saturday morning 10am-2pm'.",
              affected_tasks_count: 0,
            }
          }
        } else if (action === 'modify' && days.length > 0) {
          // Modify existing entries for the specified days
          if (constraint_type === 'available_time') {
            contextData.available_time = contextData.available_time.map((entry) => {
              if (days.includes(entry.day.toLowerCase())) {
                return {
                  ...entry,
                  start: params.time_start || entry.start,
                  end: params.time_end || entry.end,
                }
              }
              return entry
            })
          } else {
            contextData.blocked_time = contextData.blocked_time.map((entry) => {
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
        }
      }
    }

    // 4. Save updated contextData
    await prisma.project.update({
      where: { id: projectId },
      data: { contextData: contextData as unknown as Parameters<typeof prisma.project.update>[0]['data']['contextData'] },
    })

    // 5. Count affected pending tasks
    const pendingTasks = await prisma.task.count({
      where: {
        projectId,
        status: 'pending',
      },
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
