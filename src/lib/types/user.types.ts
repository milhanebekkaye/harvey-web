/**
 * User Type Definitions
 */

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
  
  // Preference objects (empty {} until filled in onboarding)
  availabilityWindows: any | null
  workSchedule: any | null
  commute: any | null
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