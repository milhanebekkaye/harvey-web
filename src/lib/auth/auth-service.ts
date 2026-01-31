/**
 * Authentication Service
 * 
 * All authentication logic lives here.
 * This service handles:
 * - Google OAuth sign-in
 * - Email signup (immediate, no confirmation)
 * - Sign out
 * - Session management
 * - User state checks
 * 
 * Why this architecture?
 * - Business logic separated from UI
 * - Easy to test (pure functions)
 * - Easy to reuse across different pages
 * - Easy to modify (change logic in one place)
 */

import { createClient } from './supabase'
import type { 
  AuthResponse, 
  OAuthOptions, 
  MagicLinkOptions,
} from '../types/auth.types'

/**
 * Sign in with Google OAuth
 * 
 * Flow:
 * 1. User clicks "Continue with Google" button
 * 2. This function redirects them to Google's OAuth consent screen
 * 3. User approves access
 * 4. Google redirects back to /auth/callback with code
 * 5. Callback handler exchanges code for session
 * 
 * @param options - Configuration for OAuth flow
 * @returns Promise<AuthResponse> - Success or error
 */
export async function signInWithGoogle(
  options?: Partial<OAuthOptions>
): Promise<AuthResponse> {
  try {
    const supabase = createClient()
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Where to redirect after successful auth
        redirectTo: options?.redirectTo || `${window.location.origin}/auth/callback`,
        // Request additional permissions from Google
        queryParams: {
          access_type: 'offline', // Get refresh token
          prompt: 'consent',      // Always show consent screen (for testing)
        },
      },
    })

    if (error) {
      return {
        success: false,
        error: {
          message: error.message,
          code: error.status?.toString(),
          details: error,
        },
      }
    }

    // Note: This return won't be reached because user gets redirected
    // But we return it for type safety
    return {
      success: true,
    }
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'An unexpected error occurred',
        details: error,
      },
    }
  }
}

/**
 * Sign up with email (immediate, no confirmation)
 * 
 * Creates account immediately and signs user in.
 * No email verification needed for MVP.
 * 
 * Flow:
 * 1. User enters email + name
 * 2. We create Supabase account with random password
 * 3. User is immediately authenticated
 * 4. Redirect to onboarding
 * 
 * Why random password?
 * - User won't need it (we'll use magic links for future logins)
 * - Supabase requires a password for signUp
 * - Password is stored securely in Supabase
 * 
 * @param email - User's email address
 * @param name - User's full name
 * @returns Promise<AuthResponse> - Success or error
 */
export async function signUpWithEmail(
  email: string,
  name: string
): Promise<AuthResponse> {
  try {
    const supabase = createClient()
    
    // Generate random password (user won't need it)
    // 32 characters of random alphanumeric
    const randomPassword = Math.random().toString(36).slice(-16) + Math.random().toString(36).slice(-16)
    
    // Create account and sign in automatically
    const { data, error } = await supabase.auth.signUp({
      email,
      password: randomPassword,
      options: {
        // Store user's name in metadata
        data: {
          full_name: name,
        },
        // Skip email confirmation for MVP
        emailRedirectTo: undefined,
      },
    })

    if (error) {
      return {
        success: false,
        error: {
          message: error.message,
          code: error.status?.toString(),
          details: error,
        },
      }
    }

    return {
      success: true,
      user: data.user || undefined,
      session: data.session || undefined,
    }
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'An unexpected error occurred',
        details: error,
      },
    }
  }
}

/**
 * Sign in with Magic Link (Passwordless Email)
 * 
 * KEPT FOR FUTURE USE - Not currently used in MVP.
 * 
 * Flow:
 * 1. User enters email
 * 2. We send them a magic link
 * 3. User clicks link in email
 * 4. Link redirects to /auth/callback with token
 * 5. User is authenticated
 * 
 * Benefits:
 * - No password to remember/forget
 * - More secure (no password to steal)
 * - Better UX for returning users
 * 
 * @param options - Email and redirect configuration
 * @returns Promise<AuthResponse> - Success or error
 */
export async function signInWithMagicLink(
  options: MagicLinkOptions
): Promise<AuthResponse> {
  try {
    const supabase = createClient()
    
    const { data, error } = await supabase.auth.signInWithOtp({
      email: options.email,
      options: {
        // Where to redirect after clicking magic link
        emailRedirectTo: options.redirectTo || `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      return {
        success: false,
        error: {
          message: error.message,
          code: error.status?.toString(),
          details: error,
        },
      }
    }

    return {
      success: true,
    }
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'An unexpected error occurred',
        details: error,
      },
    }
  }
}

/**
 * Sign out current user
 * 
 * Clears session from Supabase and local storage/cookies.
 * User will be redirected to signin page.
 * 
 * @returns Promise<AuthResponse> - Success or error
 */
export async function signOut(): Promise<AuthResponse> {
  try {
    const supabase = createClient()
    
    const { error } = await supabase.auth.signOut()

    if (error) {
      return {
        success: false,
        error: {
          message: error.message,
          details: error,
        },
      }
    }

    return {
      success: true,
    }
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'An unexpected error occurred',
        details: error,
      },
    }
  }
}

/**
 * Get current user session
 * 
 * Use this to check if user is authenticated.
 * Session contains access token, refresh token, and user info.
 * 
 * @returns Promise<Session | null> - Current session or null
 */
export async function getSession() {
  try {
    const supabase = createClient()
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error) {
      console.error('[getSession] Error:', error)
      return null
    }
    
    return session
  } catch (error) {
    console.error('[getSession] Unexpected error:', error)
    return null
  }
}

/**
 * Get current user
 * 
 * Use this to get user details (email, id, metadata, etc.)
 * Returns null if not authenticated.
 * 
 * @returns Promise<User | null> - Current user or null
 */
export async function getUser() {
  try {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error) {
      console.error('[getUser] Error:', error)
      return null
    }
    
    return user
  } catch (error) {
    console.error('[getUser] Unexpected error:', error)
    return null
  }
}

/**
 * Check if user is authenticated
 * 
 * Convenience function for quick auth checks.
 * Useful for conditional rendering and route protection.
 * 
 * @returns Promise<boolean> - True if authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession()
  return session !== null
}