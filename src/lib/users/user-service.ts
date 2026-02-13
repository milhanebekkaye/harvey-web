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
 * Get user by ID
 * 
 * Fetches user data from database.
 * Used to check if user exists and get their profile.
 * 
 * @param userId - User's ID (matches Supabase Auth ID)
 * @returns Promise<User | null> - User data or null if not found
 */
export async function getUserById(userId: string): Promise<User | null> {
  try {
    console.log('[UserService] Fetching user:', userId)
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

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
    
    const user = await prisma.user.findUnique({
      where: { email },
    })

    return user
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
    
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...data,
        updatedAt: new Date(), // Explicitly update timestamp
      } as Prisma.UserUpdateInput,
    })

    console.log('[UserService] User updated successfully')

    return {
      success: true,
      user,
    }
  } catch (error: any) {
    console.error('[UserService] Error updating user:', error)
    
    return {
      success: false,
      error: {
        message: error.message || 'Failed to update user',
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