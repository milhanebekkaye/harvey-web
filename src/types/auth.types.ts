/**
 * Authentication Types
 * 
 * Centralized type definitions for auth-related data structures.
 * This ensures type safety across the entire auth system.
 */

import { User, Session } from '@supabase/supabase-js'

/**
 * Auth providers supported by Harvey
 * Add more providers here as we expand (e.g., 'apple', 'github')
 */
export type AuthProvider = 'google' | 'email'

/**
 * Auth error structure
 * Consistent error format across all auth operations
 */
export interface AuthError {
  message: string
  code?: string
  details?: any
}

/**
 * Auth response structure
 * Standard return type for all auth operations
 */
export interface AuthResponse {
  success: boolean
  error?: AuthError
  user?: User
  session?: Session
}

/**
 * Magic link email options
 */
export interface MagicLinkOptions {
  email: string
  redirectTo?: string
}

/**
 * OAuth sign-in options
 */
export interface OAuthOptions {
  provider: Exclude<AuthProvider, 'email'>
  redirectTo?: string
}