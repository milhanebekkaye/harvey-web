/**
 * API Type Definitions
 *
 * Request and response types for the chat API endpoints.
 * Used by both frontend and backend for type safety.
 */

/**
 * Chat API Request Body
 *
 * Sent by frontend when user submits a message.
 */
export interface ChatRequest {
  /**
   * User's message content
   */
  message: string

  /**
   * Project ID for continuing conversation
   * - undefined/null: First message, will create new project
   * - string: Continue existing conversation
   */
  projectId?: string
}

/**
 * Chat API Response Body
 *
 * Returned by POST /api/chat
 */
export interface ChatResponse {
  /**
   * Claude's response message (with PROJECT_INTAKE_COMPLETE stripped)
   */
  response: string

  /**
   * Whether the intake process is complete
   * True when response contained PROJECT_INTAKE_COMPLETE
   */
  isComplete: boolean

  /**
   * Project ID (always returned)
   * - Created on first message
   * - Same as request on subsequent messages
   */
  projectId: string

  /**
   * Whether extraction/schedule generation has started
   * For future use when we add background processing
   */
  extractionStarted?: boolean
}

/**
 * Chat API Error Response
 *
 * Returned when an error occurs
 */
export interface ChatErrorResponse {
  /**
   * Human-readable error message
   */
  error: string

  /**
   * Machine-readable error code
   * Used by frontend for specific error handling
   */
  code?: string
}

/**
 * Widget types for embedded chat UI (Feature 3)
 */
export type ChatWidgetType = 'completion_feedback' | 'skip_feedback' | 'reschedule_prompt'
export type FeedbackWidgetType = Extract<
  ChatWidgetType,
  'completion_feedback' | 'skip_feedback'
>

export interface ChatWidget {
  type: ChatWidgetType
  data?: Record<string, unknown>
}

export interface WidgetAnswerMeta {
  widgetType: FeedbackWidgetType
  taskId: string
}

/**
 * Stored Message Format
 *
 * How messages are stored in Discussion.messages JSON array.
 * Matches Claude API format for easy conversion.
 * Optional widget for feedback/reschedule UI.
 */
export interface StoredMessage {
  /**
   * Who sent the message
   * - 'assistant': Harvey (Claude)
   * - 'user': The human user
   */
  role: 'assistant' | 'user'

  /**
   * The message content (text)
   */
  content: string

  /**
   * When the message was created (ISO 8601 string)
   */
  timestamp: string

  /**
   * Optional embedded widget (completion/skip feedback, reschedule prompt)
   */
  widget?: ChatWidget

  /**
   * Optional message type for styling or behaviour (e.g. daily check-in).
   */
  messageType?: 'check-in'

  /**
   * True when a feedback widget attached to this message has already been answered.
   */
  answered?: boolean
}

// ============================================
// Schedule Generation Types
// ============================================

/**
 * Generate Schedule API Request Body
 *
 * Sent by loading page to trigger schedule generation.
 */
export interface GenerateScheduleRequest {
  /**
   * Project ID to generate schedule for
   */
  projectId: string
}

/**
 * Generate Schedule API Response Body
 *
 * Returned by POST /api/generate-schedule
 */
export interface GenerateScheduleResponse {
  /**
   * Whether generation succeeded
   */
  success: boolean

  /**
   * Number of tasks created (on success)
   */
  taskCount?: number

  /**
   * Milestones text from Claude (on success)
   */
  milestones?: string

  /**
   * Error message (on failure)
   */
  error?: string

  /**
   * Error code for frontend handling (on failure)
   */
  code?: string
}

/**
 * Time Block
 *
 * Represents a block of time (blocked or available).
 * type is used for project availability blocks (work = dedicated work time, personal = personal project time).
 * When flexible_hours is set, slot capacity = flexible_hours (boundary is start/end); otherwise capacity = end - start.
 */
export interface TimeBlock {
  day: string // monday, tuesday, etc. (lowercase)
  start: string // 24-hour format: "08:00", "17:30"
  end: string // 24-hour format: "08:00", "17:30"
  label?: string // e.g., "Classes", "Work", "Class break"
  type?: 'work' | 'personal' // for availability blocks only
  window_type?: 'fixed' | 'flexible'
  flexible_hours?: number // when set, capacity = this (not end - start); only for flexible windows
}

/**
 * User work schedule (life constraint, stored on User).
 * workDays: 0 = Sunday, 1 = Monday, ... 6 = Saturday.
 *
 * Supports two formats:
 * - Legacy: workDays + startTime + endTime (single block for all selected days).
 * - Per-block days: `blocks` array; each block has its own `days` (0–6), startTime, endTime (e.g. Mon/Wed 9–12, Thu 8–13).
 */
export interface WorkScheduleShape {
  /** Legacy: used when blocks is absent or empty. */
  workDays?: number[]
  /** Legacy single block. */
  startTime?: string // 24h "09:00"
  endTime?: string // 24h "17:30"
  /** Blocks with per-block days: each applies only to its selected days. */
  blocks?: Array<{ days: number[]; startTime: string; endTime: string }>
}

/**
 * User commute (life constraint, stored on User).
 */
export interface CommuteShape {
  morning?: { durationMinutes: number; startTime: string }
  evening?: { durationMinutes: number; startTime: string }
}

/**
 * User Preferences
 *
 * Scheduling preferences extracted from conversation.
 */
export interface UserPreferences {
  start_preference?: string // e.g., "tomorrow", "next_monday", "2024-02-05"
  gym?: string // e.g., "1 hour daily, flexible timing"
  energy_peak?: string // e.g., "evenings", "mornings"
  skill_level?: string // e.g., "beginner", "intermediate", "advanced"
  break_preference?: string // e.g., "self-managed", "pomodoro"
}

/**
 * Phase entry for project phases (extracted or added later).
 */
export interface ExtractedPhase {
  id: number
  title: string
  goal?: string | null
  deadline?: string | null
  status: string // "completed" | "active" | "future"
}

/**
 * Phases container (stored in Project.phases).
 */
export interface ExtractedPhases {
  phases: ExtractedPhase[]
  active_phase_id: number
}

/**
 * Note with timestamp (projectNotes / userNotes).
 */
export interface ExtractedNote {
  note: string
  extracted_at: string // ISO
}

/**
 * Extracted Constraints
 *
 * Structured constraints extracted from onboarding conversation.
 * Scheduling subset stored in Project.contextData; enrichment fields
 * written to Project and User models.
 */
export interface ExtractedConstraints {
  /**
   * How many weeks to plan the schedule for
   * Default: 2 weeks
   */
  schedule_duration_weeks: number

  /**
   * Time blocks when user is UNAVAILABLE
   * e.g., work, classes, sleep
   */
  blocked_time: TimeBlock[]

  /**
   * Time blocks when user CAN work on project
   */
  available_time: TimeBlock[]

  /**
   * User preferences for scheduling
   */
  preferences: UserPreferences

  /**
   * Features user explicitly doesn't want
   * e.g., ["messaging", "payment integration"]
   */
  exclusions?: string[]

  // --- User life constraints (written to User.workSchedule / User.commute) ---
  work_schedule?: WorkScheduleShape | null
  commute?: CommuteShape | null

  // --- Enrichment (optional; written to Project / User at schedule generation) ---
  target_deadline?: string | null
  skill_level?: string | null
  tools_and_stack?: string[]
  project_type?: string | null
  weekly_hours_commitment?: number | null
  motivation?: string | null
  phases?: ExtractedPhases | null
  project_notes?: ExtractedNote[]
  preferred_session_length?: number | null
  communication_style?: string | null
  user_notes?: ExtractedNote[]
  /** When the user is most productive: "morning" | "afternoon" | "evening" (Session 4). */
  energy_peak?: string | null
}

/**
 * Parsed Task
 *
 * A task parsed from Claude's task generation response.
 * Before being saved to database.
 */
export interface ParsedTask {
  /**
   * Task title (specific, actionable)
   */
  title: string

  /**
   * Detailed description with bullet points
   */
  description: string

  /**
   * Observable, testable success criteria
   */
  success: string

  /**
   * Estimated hours to complete
   */
  hours: number

  /**
   * Task priority
   */
  priority: 'high' | 'medium' | 'low'

  /**
   * Task label (optional)
   */
  label?: string

  /**
   * 1-based indices of tasks this task depends on (e.g. [1, 3] = depends on first and third task in list).
   * Resolved to task IDs when persisting.
   */
  depends_on?: number[]

  /**
   * Scheduling metadata (Session 4): cognitive load — high = deep focus, medium = moderate, low = can be distracted.
   */
  energy_required?: 'high' | 'medium' | 'low'

  /**
   * Scheduling metadata (Session 4): ideal window type — peak_energy = user's best time, normal = standard, flexible = anywhere.
   */
  preferred_slot?: 'peak_energy' | 'normal' | 'flexible'
}

/**
 * Parse Result
 *
 * Result of parsing Claude's task generation response.
 */
export interface ParseResult {
  /**
   * Array of parsed tasks
   */
  tasks: ParsedTask[]

  /**
   * Milestones text (if schedule < full project)
   */
  milestones: string | null
}
