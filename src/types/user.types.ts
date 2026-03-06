/**
 * User Type Definitions
 */

/**
 * Shape of each availability window (User.availabilityWindows is an array of these).
 * fixed = exact time block; flexible = X hours within a boundary.
 */
export interface AvailabilityWindow {
  days: string[]           // e.g. ['monday', 'tuesday', ..., 'friday']
  start_time: string       // e.g. '09:00'
  end_time: string        // e.g. '17:30'
  type: string            // e.g. 'work_on_project', 'evening_work', 'weekend'
  window_type: 'fixed' | 'flexible'
  flexible_hours?: number // only when window_type === 'flexible', e.g. 3
}

/**
 * User model from database
 * Matches Prisma User model structure
 */
export interface User {
  id: string        // Same as Supabase Auth user ID
  email: string
  name: string | null
  timezone: string
  createdAt: Date
  updatedAt: Date

  // Life constraints (work schedule, commute)
  availabilityWindows: any | null
  workSchedule: any | null
  commute: any | null

  // Enrichment
  preferred_session_length?: number | null
  communication_style?: string | null
  userNotes?: unknown
  energy_peak?: string | null // "morning" | "afternoon" | "evening"

  // Onboarding questions
  onboarding_reason?: string | null
  current_work?: string | null
  work_style?: string[] | null
  biggest_challenge?: string | null
  coaching_style?: string | null
  experience_level?: string | null
  has_completed_tour?: boolean
}

/**
 * Data needed to CREATE a new user
 * 
 * Used when: User signs up for the first time
 * 
 * Required fields:
 * - id: MUST be Supabase Auth user ID (for synchronization)
 * - email: User's email from auth provider
 * 
 * Optional fields:
 * - name: User's name (from form or OAuth profile)
 * - timezone: Defaults to Europe/Paris if not provided
 * 
 * Why separate from UpdateUserData?
 * - Create requires id and email (mandatory)
 * - Update requires nothing mandatory (partial updates)
 */
export interface CreateUserData {
  id: string           // ⭐ Supabase Auth user ID (REQUIRED)
  email: string        // From auth provider (REQUIRED)
  name?: string        // Optional: from form or OAuth
  timezone?: string    // Optional: defaults to Europe/Paris
}

/**
 * Data for UPDATING an existing user
 * 
 * Used when: User fills onboarding, changes settings, updates profile
 * 
 * All fields optional = partial updates
 * Example: Only update workSchedule without touching other fields
 * 
 * Why all optional?
 * - User might only change name
 * - Or only update workSchedule
 * - Or only change timezone
 * - We don't want to require ALL fields for every update
 */
export interface UpdateUserData {
  name?: string                // Update name only
  timezone?: string            // Update timezone only
  availabilityWindows?: any    // Update availability only
  workSchedule?: any           // Update work schedule only
  commute?: any                // Update commute only
  preferred_session_length?: number   // minutes
  communication_style?: string       // "direct", "encouraging", "detailed"
  userNotes?: unknown          // [{ note, extracted_at }] — append-only array
  energy_peak?: string | null  // "morning" | "afternoon" | "evening"
  onboarding_reason?: string | null
  current_work?: string | null
  work_style?: string[] | null
  biggest_challenge?: string | null
  coaching_style?: string | null
  experience_level?: string | null
  has_completed_tour?: boolean
}

/**
 * Response from user service operations
 */
export interface UserServiceResponse {
  success: boolean
  user?: User
  error?: {
    message: string
    code?: string
    details?: any
  }
}