'use server'

/**
 * User Server Actions
 *
 * Server Actions for user database operations.
 * These run on the server and can safely use Prisma.
 *
 * Why Server Actions?
 * - Prisma can only run on the server (not in browser)
 * - Server Actions are automatically secure (can't be called from outside)
 * - Easy to call from client components
 */

import { createUser as createUserInDb, userExists as checkUserExists } from './user-service'
import type { CreateUserData, UserServiceResponse } from '../types/user.types'

/**
 * Server Action: Create user in database
 *
 * Call this from client components after successful Supabase auth.
 * Safely creates user record using Prisma on the server.
 *
 * @param data - User creation data (id from Supabase Auth, email, name)
 * @returns Promise<UserServiceResponse> - Created user or error
 */
export async function createUserAction(data: CreateUserData): Promise<UserServiceResponse> {
  console.log('[UserAction] Creating user via server action:', data.email)

  try {
    const result = await createUserInDb(data)
    return result
  } catch (error: any) {
    console.error('[UserAction] Error creating user:', error)
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
 * Server Action: Check if user exists in database
 *
 * @param userId - User's ID (matches Supabase Auth ID)
 * @returns Promise<boolean> - True if user exists
 */
export async function userExistsAction(userId: string): Promise<boolean> {
  console.log('[UserAction] Checking if user exists:', userId)

  try {
    return await checkUserExists(userId)
  } catch (error) {
    console.error('[UserAction] Error checking user existence:', error)
    return false
  }
}
