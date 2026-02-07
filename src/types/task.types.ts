/**
 * Task Type Definitions
 *
 * Types for task display in the dashboard.
 * These types bridge the gap between database Task model and UI display needs.
 *
 * Database Task (Prisma) → DashboardTask (display) mapping:
 * - id (UUID string) → id (string)
 * - title → title
 * - description → description
 * - estimatedDuration (minutes) → duration (formatted string like "2h", "30m")
 * - label → label
 * - status (pending/in_progress/completed/skipped) → status (with UI additions)
 * - priority (1-5) → priority (mapped to status urgency)
 * - successCriteria → parsed into checklist items
 * - scheduledDate/scheduledStartTime/scheduledEndTime → day, startTime, endTime
 */

// ============================================
// Status Types
// ============================================

/**
 * Database task statuses (from Prisma schema)
 *
 * These are the actual statuses stored in the database.
 */
export type DatabaseTaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

/**
 * UI task statuses (extended for display purposes)
 *
 * Includes additional visual states:
 * - 'urgent': High priority tasks (priority 1)
 * - 'focus': Currently in progress tasks
 */
export type TaskStatus = DatabaseTaskStatus | 'urgent' | 'focus'

/**
 * Map database status + priority to UI status
 *
 * @param dbStatus - Status from database
 * @param priority - Priority level (1-5, where 1 is highest)
 * @returns UI status for display
 */
export function mapToUIStatus(dbStatus: DatabaseTaskStatus, priority: number): TaskStatus {
  // Completed and skipped stay as-is
  if (dbStatus === 'completed' || dbStatus === 'skipped') {
    return dbStatus
  }

  // In progress becomes "focus"
  if (dbStatus === 'in_progress') {
    return 'focus'
  }

  // High priority pending becomes "urgent"
  if (dbStatus === 'pending' && priority === 1) {
    return 'urgent'
  }

  // Default to pending
  return 'pending'
}

// ============================================
// Label Types
// ============================================

/**
 * Task labels for visual grouping
 *
 * Used for colored badges in the UI.
 */
export type TaskLabel =
  | 'Coding'
  | 'Research'
  | 'Design'
  | 'Marketing'
  | 'Communication'
  | 'Personal'
  | 'Planning'

/**
 * Label colors for badges
 *
 * Maps label to Tailwind color classes.
 */
export const TASK_LABEL_COLORS: Record<TaskLabel, { bg: string; text: string }> = {
  Coding: { bg: 'bg-blue-100', text: 'text-blue-700' },
  Research: { bg: 'bg-green-100', text: 'text-green-700' },
  Design: { bg: 'bg-purple-100', text: 'text-purple-700' },
  Marketing: { bg: 'bg-orange-100', text: 'text-orange-700' },
  Communication: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  Personal: { bg: 'bg-gray-100', text: 'text-gray-700' },
  Planning: { bg: 'bg-pink-100', text: 'text-pink-700' },
}

// TODO: When Claude can dynamically generate labels/colors, move mapping to a config store.

/**
 * Normalize raw label strings into supported labels.
 *
 * Defaults to Planning when missing or invalid.
 */
export function normalizeTaskLabel(input?: string | null): TaskLabel {
  if (!input) {
    return 'Planning'
  }

  const normalized = input.trim().toLowerCase()

  const map: Record<string, TaskLabel> = {
    coding: 'Coding',
    development: 'Coding',
    dev: 'Coding',
    engineering: 'Coding',
    research: 'Research',
    design: 'Design',
    marketing: 'Marketing',
    communication: 'Communication',
    comms: 'Communication',
    personal: 'Personal',
    planning: 'Planning',
    plan: 'Planning',
  }

  return map[normalized] || 'Planning'
}

// ============================================
// Checklist Types
// ============================================

/**
 * Checklist Item
 *
 * Represents a single item in the task's success criteria checklist.
 * Can be parsed from the successCriteria string or stored separately.
 */
export interface ChecklistItem {
  /**
   * Unique identifier for the checklist item
   */
  id: string

  /**
   * Text content of the checklist item
   */
  text: string

  /**
   * Whether the item has been completed
   */
  done: boolean
}

/**
 * Parse success criteria into checklist items
 *
 * Handles two formats:
 * 1. JSON array (new format): Array<{id, text, done}>
 * 2. String (legacy format): Newline-separated text
 *
 * @param successCriteria - Success criteria (JSON or string)
 * @returns Array of checklist items
 */
export function parseSuccessCriteria(
  successCriteria: unknown
): ChecklistItem[] {
  if (!successCriteria) {
    return []
  }

  // NEW FORMAT: JSON array of {id, text, done}
  if (Array.isArray(successCriteria)) {
    return successCriteria.map((item, index) => ({
      id: item.id || `checklist-${index}`,
      text: item.text || '',
      done: item.done || false,
    }))
  }

  // LEGACY FORMAT: String parsing
  if (typeof successCriteria === 'string') {
    const lines = successCriteria
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    return lines.map((line, index) => {
      const cleanedText = line
        .replace(/^[-•*]\s*/, '')
        .replace(/^\d+\.\s*/, '')
        .trim()

      return {
        id: `checklist-${index}`,
        text: cleanedText,
        done: false,
      }
    })
  }

  // Unknown format, return empty
  return []
}

// ============================================
// Dashboard Task Type
// ============================================

/**
 * Dashboard Task
 *
 * The main type used for displaying tasks in the dashboard.
 * This is a transformed version of the database Task model,
 * optimized for UI display.
 */
export interface DashboardTask {
  /**
   * Unique identifier (UUID from database)
   */
  id: string

  /**
   * Task title
   */
  title: string

  /**
   * Formatted duration string (e.g., "2h", "30m", "1h 30m")
   */
  duration: string

  /**
   * Task label for visual grouping
   */
  label: TaskLabel

  /**
   * Current task status for display
   */
  status: TaskStatus

  /**
   * Full task description
   */
  description: string

  /**
   * Success criteria parsed into checklist items
   */
  checklist: ChecklistItem[]

  /**
   * AI coaching tip from Harvey
   * Optional - may be generated on demand or pre-computed
   */
  harveyTip?: string

  /**
   * Day of the week for calendar view (Mon-Sun)
   */
  day: string

  /**
   * Start hour for calendar positioning (0-23, can include decimals for minutes)
   * e.g., 9.5 = 9:30 AM
   */
  startTime: number

  /**
   * End hour for calendar positioning (0-23, can include decimals)
   */
  endTime: number

  /**
   * Original database priority (1-5) for reference
   */
  priority: number

  /**
   * Project ID this task belongs to (if any)
   */
  projectId?: string

  /**
   * Estimated duration in minutes (original value from database)
   */
  estimatedMinutes: number

  /**
   * Scheduled date (ISO string)
   */
  scheduledDate?: string

  /**
   * Task IDs this task depends on (for dependency chain and cascade skip)
   */
  dependsOn?: string[]
}

// ============================================
// Grouping Types
// ============================================

/**
 * A single day section for the timeline view
 */
export interface DaySection {
  /**
   * Unique key for the section (e.g., "wednesday", "thursday")
   */
  key: string

  /**
   * Display label (e.g., "WEDNESDAY", "THURSDAY")
   */
  label: string

  /**
   * ISO date string for this day (e.g., "2024-02-07")
   */
  date: string

  /**
   * Tasks scheduled for this day
   */
  tasks: DashboardTask[]
}

/**
 * Task groups for timeline view
 *
 * Tasks are grouped by time period for display.
 * Individual days this week are shown separately.
 */
export interface TaskGroups {
  /**
   * Tasks that are past their scheduled date and not completed/skipped
   */
  overdue: DashboardTask[]

  /**
   * Tasks scheduled for today
   */
  today: DashboardTask[]

  /**
   * Tasks scheduled for tomorrow
   */
  tomorrow: DashboardTask[]

  /**
   * Individual days for the rest of this week (after tomorrow, up to Sunday)
   * Each entry represents one day with its tasks
   */
  weekDays: DaySection[]

  /**
   * Tasks scheduled for next week (Mon-Sun of the following week)
   */
  nextWeek: DashboardTask[]

  /**
   * Tasks scheduled more than 2 weeks out
   */
  later: DashboardTask[]

  /**
   * Tasks without a scheduled date
   */
  unscheduled: DashboardTask[]
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format minutes into a readable duration string
 *
 * @param minutes - Duration in minutes
 * @returns Formatted string like "2h", "30m", "1h 30m"
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (remainingMinutes === 0) {
    return `${hours}h`
  }

  return `${hours}h ${remainingMinutes}m`
}

/**
 * Get day abbreviation from Date
 *
 * @param date - Date object or ISO string
 * @returns Day abbreviation (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
 */
export function getDayAbbreviation(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return days[d.getDay()]
}

/**
 * Extract hour as decimal from Date
 *
 * @param date - Date object or ISO string
 * @returns Hour as decimal (e.g., 9.5 for 9:30 AM)
 */
export function getHourDecimal(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.getHours() + d.getMinutes() / 60
}

/**
 * Status colors for UI display
 *
 * Maps task status to Tailwind color classes.
 */
export const STATUS_COLORS: Record<TaskStatus, { border: string; bg: string; text: string }> = {
  completed: {
    border: 'border-l-green-500',
    bg: 'bg-green-500',
    text: 'text-green-600',
  },
  urgent: {
    border: 'border-l-red-500',
    bg: 'bg-red-500',
    text: 'text-red-600',
  },
  focus: {
    border: 'border-l-purple-600',
    bg: 'bg-purple-600',
    text: 'text-purple-600',
  },
  pending: {
    border: 'border-l-slate-400',
    bg: 'bg-slate-400',
    text: 'text-slate-600',
  },
  in_progress: {
    border: 'border-l-purple-600',
    bg: 'bg-purple-600',
    text: 'text-purple-600',
  },
  skipped: {
    border: 'border-l-gray-400',
    bg: 'bg-gray-400',
    text: 'text-gray-500',
  },
}

/**
 * Get status display label
 *
 * @param status - Task status
 * @returns Human-readable status label
 */
export function getStatusLabel(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    completed: 'Completed',
    urgent: 'Urgent',
    focus: 'In Focus',
    pending: 'Pending',
    in_progress: 'In Progress',
    skipped: 'Skipped',
  }
  return labels[status]
}
