/**
 * Chat Router Type Definitions
 *
 * Shared types for the post-onboarding chat system.
 * Used by context assembly, tool execute functions, and the API route.
 */

import type { Task, Project, User } from '@prisma/client'

// ============================================
// Context Data Types (matches existing ExtractedConstraints + new fields)
// ============================================

/**
 * A recurring time block (one entry per day-slot).
 * Matches existing TimeBlock from api.types.ts.
 */
export interface TimeBlockEntry {
  day: string    // lowercase: "monday", "tuesday", etc.
  start: string  // "20:00" — 24h format
  end: string    // "23:00" — 24h format
  label?: string // "Classes", "Work", etc.
}

/**
 * A one-off temporary block (specific date exception).
 * Used for "I can't work this Friday" style requests.
 */
export interface OneOffBlock {
  date: string          // "2026-02-14" — specific date
  date_start?: string   // for ranges
  date_end?: string     // for ranges
  start_time?: string   // "19:00" — null if all_day
  end_time?: string     // "23:00" — null if all_day
  all_day: boolean
  reason?: string       // "Valentine's dinner"
}

/**
 * Full contextData structure stored on Project.contextData (JSON).
 * Extends the existing ExtractedConstraints format with one_off_blocks.
 */
export interface ContextData {
  schedule_duration_weeks?: number
  blocked_time: TimeBlockEntry[]
  available_time: TimeBlockEntry[]
  one_off_blocks?: OneOffBlock[]
  preferences: Record<string, unknown>
  exclusions?: string[]
}

// ============================================
// Task Stats
// ============================================

/**
 * Computed statistics from a project's tasks.
 * Used by the system prompt and progress tools.
 */
export interface TaskStats {
  total: number
  completed: number
  skipped: number
  pending: number
  todayTasks: Task[]
  completionRate: number       // 0-100
  avgAccuracy: number | null   // ratio of actual/estimated duration
  skipReasons: Record<string, number>
  currentBatch: number
}

// ============================================
// Tool Result Types
// ============================================

/**
 * Base result returned by all tool execute functions.
 */
export interface ToolResult {
  success: boolean
  message: string
}

/**
 * Result from modify_schedule tool.
 */
export interface ModifyScheduleResult extends ToolResult {
  conflicts?: string[]
  dependency_issues?: string[]
}

/**
 * Result from update_constraints tool.
 */
export interface UpdateConstraintsResult extends ToolResult {
  affected_tasks_count: number
}

/**
 * Result from add_task tool.
 */
export interface AddTaskResult extends ToolResult {
  task?: {
    id: string
    title: string
    scheduled_date: string | null
    scheduled_start_time: string | null
    scheduled_end_time: string | null
  }
}

/**
 * Result from suggest_next_action tool.
 */
export interface SuggestNextActionResult {
  current_task: { id: string; title: string; start_time: string | null; end_time: string | null; description: string | null } | null
  next_task: { id: string; title: string; start_time: string | null; description: string | null } | null
  overdue_tasks: { id: string; title: string; original_date: string; description: string | null }[]
  remaining_time_today_minutes: number
  tasks_completed_today: number
  tasks_remaining_today: number
  suggestion_context: string
}

/**
 * Result from get_progress_summary tool.
 */
export interface ProgressSummaryResult {
  period: string
  total: number
  completed: number
  skipped: number
  pending: number
  completion_rate_percent: number
}

/**
 * Structured change summary for regenerate_schedule (used for concise Harvey recap).
 */
export interface RegenerateScheduleChangeSummary {
  rescheduled_count: number
  moved_count?: number
  completion_date_before?: string
  completion_date_after?: string
}

/**
 * Result from regenerate_schedule tool.
 */
export interface RegenerateScheduleResult extends ToolResult {
  rescheduled_count?: number
  locked_count?: number
  new_task_count?: number
  /** Structured summary so Harvey can give a clear, concise explanation. */
  change_summary?: RegenerateScheduleChangeSummary
}

/**
 * Result from update_project_notes tool.
 */
export interface UpdateProjectNotesResult extends ToolResult {}

// ============================================
// Re-exports for convenience
// ============================================

export type { Task, Project, User }
