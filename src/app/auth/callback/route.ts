/**
 * OAuth Callback Route Handler
 * 
 * This is where Google/Email magic links redirect to after authentication.
 * 
 * Flow:
 * 1. User authenticates with Google
 * 2. Google redirects to: /auth/callback?code=xyz123
 * 3. This handler exchanges code for session
 * 4. Sets cookies for session management
 * 5. Redirects to /onboarding (or dashboard if returning user)
 * 
 * Why a Route Handler and not a Page?
 * - We don't need to render UI
 * - We just process the OAuth code and redirect
 * - Route handlers are faster for this use case
 * 
 * Flutter parallel: Like handling deep links after OAuth in Flutter
 */

import { createClient } from '@/lib/auth/supabase'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  console.log('[AuthCallback] Received callback with code:', code ? 'present' : 'missing')

  if (code) {
    const supabase = createClient()
    
    try {
      // Exchange code for session
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (error) {
        console.error('[AuthCallback] Error exchanging code:', error)
        // Redirect to signin with error
        return NextResponse.redirect(
          new URL('/signin?error=auth_failed', requestUrl.origin)
        )
      }

      console.log('[AuthCallback] Session created successfully for user:', data.user?.email)

      // Check if user exists in database
      // (We'll implement this after we set up the users table)
      
      // For now, redirect to onboarding
      // Later: check if user.onboarding_completed and redirect accordingly
      return NextResponse.redirect(new URL('/onboarding', requestUrl.origin))
      
    } catch (error) {
      console.error('[AuthCallback] Unexpected error:', error)
      return NextResponse.redirect(
        new URL('/signin?error=unexpected_error', requestUrl.origin)
      )
    }
  }

  // No code present - invalid callback
  console.error('[AuthCallback] No code parameter in callback URL')
  return NextResponse.redirect(
    new URL('/signin?error=invalid_callback', requestUrl.origin)
  )
}