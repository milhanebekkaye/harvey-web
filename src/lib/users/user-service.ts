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
import type { CreateUserData, UpdateUserData, UserServiceResponse, User } from '../types/user.types'

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
    
    // Create user in database
    const user = await prisma.user.create({
      data: {
        // ⭐ IMPORTANT: Use Supabase Auth user ID as primary key
        // This keeps auth and database users synchronized
        id: data.id,
        
        // Basic user info from signup
        email: data.email,
        name: data.name || null,
        timezone: data.timezone || 'Europe/Paris',
        
        // ⭐ Create EMPTY objects (not null) for preferences
        // This way we don't need null checks everywhere
        // Will be filled during onboarding
        availabilityWindows: {},  // Empty object, ready to be filled
        workSchedule: {},         // Empty object, ready to be filled
        commute: {},              // Empty object, ready to be filled
      },
    })

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
    if (error.code === 'P2002') {
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
      },
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