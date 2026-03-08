/**
 * User Service
 * 
 * Handles all database operations for users.
 * This service manages:
 * - Creating users in database after auth
 * - Fetching user data
 * - Updating user profiles
 * - Checking if user exists
 * 
 * Why separate from auth-service?
 * - Auth deals with authentication (Supabase Auth)
 * - User service deals with database (Prisma)
 * - Clean separation of concerns
 * - Easy to test and modify independently
 */

import { prisma } from '../db/prisma'
import type { Prisma } from '@prisma/client'
import type { CreateUserData, UpdateUserData, UserServiceResponse, User } from '../../types/user.types'

/**
 * Create a new user in the database
 * 
 * Called immediately after successful authentication.
 * Creates user record with:
 * - Basic info: id (SAME as Supabase Auth ID), email, name
 * - Empty preference objects: workSchedule, availability, commute
 * 
 * ⭐ CRITICAL: User ID matches Supabase Auth ID exactly!
 * This means:
 * - Supabase Auth user ID: "abc-123-xyz"
 * - Database user ID: "abc-123-xyz" (SAME!)
 * - Easy to sync and fetch user data
 * 
 * @param data - User creation data (id from Supabase Auth, email, name)
 * @returns Promise<UserServiceResponse> - Created user or error
 */
export async function createUser(data: CreateUserData): Promise<UserServiceResponse> {
  try {
    console.log('[UserService] Creating user with Supabase Auth ID:', data.id)
    console.log('[UserService] Email:', data.email)

    // Workaround: Prisma 7 + @prisma/adapter-pg + @@map("users") can trigger
    // P2022 "column (not available) does not exist" on prisma.user.create().
    // Use raw SQL insert so the user is created reliably.
    const timezone = data.timezone ?? 'Europe/Paris'
    const name = data.name ?? null
    const emptyJson = JSON.stringify({})
    const now = new Date()

    const rows = await prisma.$queryRaw<
      Array<{
        id: string
        email: string
        name: string | null
        timezone: string
        createdAt: Date
        updatedAt: Date
        availabilityWindows: unknown
        workSchedule: unknown
        commute: unknown
      }>
    >`
      INSERT INTO "users" (
        "id", "email", "name", "timezone",
        "createdAt", "updatedAt",
        "availabilityWindows", "workSchedule", "commute"
      )
      VALUES (
        ${data.id}, ${data.email}, ${name}, ${timezone},
        ${now}, ${now},
        ${emptyJson}::jsonb, ${emptyJson}::jsonb, ${emptyJson}::jsonb
      )
      RETURNING
        "id", "email", "name", "timezone",
        "createdAt", "updatedAt",
        "availabilityWindows", "workSchedule", "commute"
    `

    const row = rows[0]
    if (!row) {
      throw new Error('Insert did not return a row')
    }

    const user: User = {
      id: row.id,
      email: row.email,
      name: row.name,
      timezone: row.timezone,
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
      availabilityWindows: row.availabilityWindows ?? {},
      workSchedule: row.workSchedule ?? {},
      commute: row.commute ?? {},
      has_completed_tour: false,
      payment_status: 'free',
    }

    console.log('[UserService] ✅ User created successfully!')
    console.log('[UserService] Database ID:', user.id)
    console.log('[UserService] (This matches Supabase Auth ID)')

    return {
      success: true,
      user,
    }
  } catch (error: any) {
    console.error('[UserService] ❌ Error creating user:', error)
    
    // Handle duplicate error (user already exists)
    // P2002 = Prisma unique constraint; 23505 = PostgreSQL unique_violation
    const isDuplicate =
      error.code === 'P2002' ||
      error.code === '23505' ||
      /unique|duplicate/i.test(String(error.message ?? ''))

    if (isDuplicate) {
      console.error('[UserService] User with this email already exists')
      return {
        success: false,
        error: {
          message: 'User with this email already exists',
          code: 'DUPLICATE_USER',
          details: error,
        },
      }
    }

    // Generic error
    return {
      success: false,
      error: {
        message: error.message || 'Failed to create user',
        details: error,
      },
    }
  }
}

/**
 * Raw SQL fetch for user by ID.
 * Used to avoid Prisma P2022 "column (not available)" with Prisma 7 + adapter-pg
 * when reading the users table (findUnique has the same bug as update).
 */
async function getUserByIdRaw(userId: string): Promise<User | null> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      email: string
      name: string | null
      timezone: string
      createdAt: Date
      updatedAt: Date
      availabilityWindows: unknown
      workSchedule: unknown
      commute: unknown
      preferred_session_length: number | null
      communication_style: string | null
      userNotes: unknown
      energy_peak: string | null
      rest_days: string[]
      oneOffBlocks: unknown
      onboarding_reason: string | null
      current_work: string | null
      work_style: unknown
      biggest_challenge: string | null
      coaching_style: string | null
      experience_level: string | null
      has_completed_tour: boolean
      payment_status: string
    }>
  >(
    `SELECT "id", "email", "name", "timezone", "createdAt", "updatedAt",
            "availabilityWindows", "workSchedule", "commute",
            "preferred_session_length", "communication_style", "userNotes", "energy_peak",
            "rest_days", "oneOffBlocks",
            "rest_days", "oneOffBlocks",
            "onboarding_reason", "current_work", "work_style", "biggest_challenge",
            "coaching_style", "experience_level", "has_completed_tour", "payment_status"
     FROM "users" WHERE "id" = $1`,
    userId
  )
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    timezone: row.timezone,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
    availabilityWindows: Array.isArray(row.availabilityWindows) ? row.availabilityWindows : (row.availabilityWindows ? null : undefined),
    workSchedule: row.workSchedule ?? null,
    commute: row.commute ?? null,
    preferred_session_length: row.preferred_session_length ?? undefined,
    communication_style: row.communication_style ?? undefined,
    userNotes: row.userNotes ?? undefined,
    energy_peak: row.energy_peak ?? undefined,
    rest_days: Array.isArray(row.rest_days) ? row.rest_days : [],
    oneOffBlocks: Array.isArray(row.oneOffBlocks) ? row.oneOffBlocks : (row.oneOffBlocks ? null : undefined),
    onboarding_reason: row.onboarding_reason ?? undefined,
    current_work: row.current_work ?? undefined,
    work_style: (() => {
      const val = row.work_style
      if (!val) return undefined
      if (Array.isArray(val)) return val
      if (typeof val === 'string') {
        try { return JSON.parse(val) } catch { return [val] }
      }
      return undefined
    })(),
    biggest_challenge: row.biggest_challenge ?? undefined,
    coaching_style: row.coaching_style ?? undefined,
    experience_level: row.experience_level ?? undefined,
    has_completed_tour: row.has_completed_tour,
    payment_status: row.payment_status ?? 'free',
  }
}

/**
 * Get user by ID
 *
 * Fetches user data from database.
 * Used to check if user exists and get their profile.
 * Uses raw SQL to avoid Prisma P2022 with Prisma 7 + adapter-pg.
 *
 * @param userId - User's ID (matches Supabase Auth ID)
 * @returns Promise<User | null> - User data or null if not found
 */
export async function getUserById(userId: string): Promise<User | null> {
  try {
    console.log('[UserService] Fetching user:', userId)
    const user = await getUserByIdRaw(userId)
    if (!user) {
      console.log('[UserService] User not found:', userId)
      return null
    }
    console.log('[UserService] User found:', user.email)
    return user
  } catch (error) {
    console.error('[UserService] Error fetching user:', error)
    return null
  }
}

/**
 * Get user by email
 * 
 * Useful for checking if email is already registered.
 * 
 * @param email - User's email address
 * @returns Promise<User | null> - User data or null if not found
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    console.log('[UserService] Fetching user by email:', email)

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string
        email: string
        name: string | null
        timezone: string
        createdAt: Date
        updatedAt: Date
        availabilityWindows: unknown
        workSchedule: unknown
        commute: unknown
        preferred_session_length: number | null
        communication_style: string | null
        userNotes: unknown
        energy_peak: string | null
        rest_days: string[]
        oneOffBlocks: unknown
        onboarding_reason: string | null
        current_work: string | null
        work_style: unknown
        biggest_challenge: string | null
        coaching_style: string | null
        experience_level: string | null
        has_completed_tour: boolean
        payment_status: string
      }>
    >(
      `SELECT "id", "email", "name", "timezone", "createdAt", "updatedAt",
              "availabilityWindows", "workSchedule", "commute",
              "preferred_session_length", "communication_style", "userNotes", "energy_peak",
              "rest_days", "oneOffBlocks",
              "rest_days", "oneOffBlocks",
              "onboarding_reason", "current_work", "work_style", "biggest_challenge",
              "coaching_style", "experience_level", "has_completed_tour", "payment_status"
       FROM "users" WHERE "email" = $1`,
      email
    )

    const row = rows[0]
    if (!row) return null

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      timezone: row.timezone,
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
      availabilityWindows: row.availabilityWindows ?? null,
      workSchedule: row.workSchedule ?? null,
      commute: row.commute ?? null,
      preferred_session_length: row.preferred_session_length ?? undefined,
      communication_style: row.communication_style ?? undefined,
      userNotes: row.userNotes ?? undefined,
      energy_peak: row.energy_peak ?? undefined,
      rest_days: Array.isArray(row.rest_days) ? row.rest_days : [],
      oneOffBlocks: Array.isArray(row.oneOffBlocks) ? row.oneOffBlocks : (row.oneOffBlocks ? null : undefined),
      onboarding_reason: row.onboarding_reason ?? undefined,
      current_work: row.current_work ?? undefined,
      work_style: (() => {
        const val = row.work_style
        if (!val) return undefined
        if (Array.isArray(val)) return val
        if (typeof val === 'string') {
          try { return JSON.parse(val) } catch { return [val] }
        }
        return undefined
      })(),
      biggest_challenge: row.biggest_challenge ?? undefined,
      coaching_style: row.coaching_style ?? undefined,
      experience_level: row.experience_level ?? undefined,
      has_completed_tour: row.has_completed_tour,
      payment_status: row.payment_status ?? 'free',
    }
  } catch (error) {
    console.error('[UserService] Error fetching user by email:', error)
    return null
  }
}

/**
 * Update user profile
 *
 * Updates user data (name, timezone, preferences, etc.)
 * Used during onboarding to fill in workSchedule, availability, etc.
 *
 * Uses raw SQL to avoid Prisma P2022 "column (not available)" with Prisma 7 + adapter-pg
 * (same workaround as createUser). Only updates columns present in data.
 *
 * @param userId - User's ID
 * @param data - Fields to update (partial)
 * @returns Promise<UserServiceResponse> - Updated user or error
 */
export async function updateUser(
  userId: string,
  data: UpdateUserData
): Promise<UserServiceResponse> {
  try {
    console.log('[UserService] Updating user:', userId, data)

    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (data.name !== undefined) {
      updates.push(`"name" = $${paramIndex}`)
      values.push(data.name)
      paramIndex++
    }
    if (data.timezone !== undefined) {
      updates.push(`"timezone" = $${paramIndex}`)
      values.push(data.timezone)
      paramIndex++
    }
    if (data.workSchedule !== undefined) {
      updates.push(`"workSchedule" = $${paramIndex}::jsonb`)
      values.push(JSON.stringify(data.workSchedule))
      paramIndex++
    }
    if (data.commute !== undefined) {
      updates.push(`"commute" = $${paramIndex}::jsonb`)
      values.push(JSON.stringify(data.commute))
      paramIndex++
    }
    if (data.availabilityWindows !== undefined) {
      const serialized = JSON.stringify(data.availabilityWindows)
      console.log('[UserService] Updating availabilityWindows', { length: serialized.length, preview: serialized.slice(0, 200) })
      updates.push(`"availabilityWindows" = $${paramIndex}::jsonb`)
      values.push(serialized)
      paramIndex++
    }
    if (data.preferred_session_length !== undefined) {
      updates.push(`"preferred_session_length" = $${paramIndex}`)
      values.push(data.preferred_session_length)
      paramIndex++
    }
    if (data.communication_style !== undefined) {
      updates.push(`"communication_style" = $${paramIndex}`)
      values.push(data.communication_style)
      paramIndex++
    }
    if (data.userNotes !== undefined) {
      updates.push(`"userNotes" = $${paramIndex}::jsonb`)
      values.push(JSON.stringify(data.userNotes))
      paramIndex++
    }
    if (data.energy_peak !== undefined) {
      updates.push(`"energy_peak" = $${paramIndex}`)
      values.push(data.energy_peak)
      paramIndex++
    }
    if (data.rest_days !== undefined) {
      updates.push(`"rest_days" = $${paramIndex}::text[]`)
      values.push(data.rest_days)
      paramIndex++
    }
    if (data.oneOffBlocks !== undefined) {
      updates.push(`"oneOffBlocks" = $${paramIndex}::jsonb`)
      values.push(JSON.stringify(data.oneOffBlocks))
      paramIndex++
    }
    if (data.onboarding_reason !== undefined) {
      updates.push(`"onboarding_reason" = $${paramIndex}`)
      values.push(data.onboarding_reason)
      paramIndex++
    }
    if (data.current_work !== undefined) {
      updates.push(`"current_work" = $${paramIndex}`)
      values.push(data.current_work)
      paramIndex++
    }
    if (data.work_style !== undefined) {
      updates.push(`"work_style" = $${paramIndex}::jsonb`)
      values.push(JSON.stringify(data.work_style))
      paramIndex++
    }
    if (data.biggest_challenge !== undefined) {
      updates.push(`"biggest_challenge" = $${paramIndex}`)
      values.push(data.biggest_challenge)
      paramIndex++
    }
    if (data.coaching_style !== undefined) {
      updates.push(`"coaching_style" = $${paramIndex}`)
      values.push(data.coaching_style)
      paramIndex++
    }
    if (data.experience_level !== undefined) {
      updates.push(`"experience_level" = $${paramIndex}`)
      values.push(data.experience_level)
      paramIndex++
    }
    if (data.has_completed_tour !== undefined) {
      updates.push(`"has_completed_tour" = $${paramIndex}`)
      values.push(data.has_completed_tour)
      paramIndex++
    }
    if (data.payment_status !== undefined) {
      updates.push(`"payment_status" = $${paramIndex}`)
      values.push(data.payment_status)
      paramIndex++
    }

    if (updates.length === 0) {
      const user = await getUserByIdRaw(userId)
      return user ? { success: true, user } : { success: false, error: { message: 'User not found' } }
    }

    updates.push(`"updatedAt" = $${paramIndex}`)
    values.push(new Date())
    paramIndex++
    values.push(userId)

    const sql = `UPDATE "users" SET ${updates.join(', ')} WHERE "id" = $${paramIndex}`
    console.log('[UserService] Executing update', { sql: sql.slice(0, 120), paramCount: values.length })
    const updateResult = await prisma.$executeRawUnsafe(sql, ...values)
    console.log('[UserService] Update result (row count)', updateResult)

    const user = await getUserByIdRaw(userId)
    if (!user) {
      return { success: false, error: { message: 'User not found after update' } }
    }

    if (data.availabilityWindows !== undefined) {
      const aw = user.availabilityWindows
      console.log('[UserService] User updated successfully; availabilityWindows after read', Array.isArray(aw) ? { count: aw.length, sample: JSON.stringify((aw as unknown[]).slice(0, 1)) } : aw)
    } else {
      console.log('[UserService] User updated successfully')
    }
    return { success: true, user }
  } catch (error: unknown) {
    console.error('[UserService] Error updating user:', error)
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to update user',
        details: error,
      },
    }
  }
}

/**
 * Check if user exists in database
 * 
 * Quick check without fetching full user data.
 * Used to determine if we need to create user record.
 * 
 * @param userId - User's ID
 * @returns Promise<boolean> - True if user exists
 */
export async function userExists(userId: string): Promise<boolean> {
  try {
    const count = await prisma.user.count({
      where: { id: userId },
    })
    
    return count > 0
  } catch (error) {
    console.error('[UserService] Error checking if user exists:', error)
    return false
  }
}

/**
 * Delete user from database
 * 
 * CAREFUL: This deletes all user data (projects, tasks, etc.)
 * Only use for account deletion or testing.
 * 
 * @param userId - User's ID
 * @returns Promise<boolean> - True if deleted successfully
 */
export async function deleteUser(userId: string): Promise<boolean> {
  try {
    console.log('[UserService] Deleting user:', userId)
    
    await prisma.user.delete({
      where: { id: userId },
    })

    console.log('[UserService] User deleted successfully')
    return true
  } catch (error) {
    console.error('[UserService] Error deleting user:', error)
    return false
  }
}