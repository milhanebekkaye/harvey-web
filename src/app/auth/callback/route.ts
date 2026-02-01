/**
 * OAuth Callback Route Handler
 * 
 * Handles the redirect after OAuth authentication (Google).
 * 
 * TWO-STEP PROCESS:
 * 1. Exchange OAuth code for Supabase session
 * 2. Create database user if doesn't exist
 * 
 * Flow:
 * 1. User authenticates with Google
 * 2. Google redirects here with code
 * 3. We exchange code for session (Supabase Auth)
 * 4. We check if user exists in database
 * 5. If not, create database user record
 * 6. Redirect to onboarding (or dashboard if returning user)
 */

import { createClient } from '@/lib/auth/supabase-server'
import { createUser, userExists } from '@/lib/users/user-service'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/onboarding'

  console.log('[AuthCallback] Callback received:', { 
    hasCode: !!code, 
    next 
  })

  // No code = invalid callback
  if (!code) {
    console.error('[AuthCallback] No code in URL')
    return NextResponse.redirect(
      new URL('/signin?error=no_code', requestUrl.origin)
    )
  }

  const supabase = await createClient()
  
  try {
    // ===== STEP 1: Exchange code for session =====
    console.log('[AuthCallback] Exchanging code for session')
    
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('[AuthCallback] Exchange error:', error)
      return NextResponse.redirect(
        new URL(`/signin?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
      )
    }

    if (!data.user) {
      console.error('[AuthCallback] No user in session')
      return NextResponse.redirect(
        new URL('/signin?error=no_user', requestUrl.origin)
      )
    }

    console.log('[AuthCallback] Session created for user:', data.user.email)

    // ===== STEP 2: Create database user if needed =====
    
    // Check if user already exists in database
    const exists = await userExists(data.user.id)
    
    if (!exists) {
      console.log('[AuthCallback] User not in database, creating record')
      
      // Extract name from OAuth metadata
      const userName = data.user.user_metadata?.full_name || 
                       data.user.user_metadata?.name || 
                       null

      // Create database user
      const userResult = await createUser({
        id: data.user.id,
        email: data.user.email!,
        name: userName,
        timezone: 'Europe/Paris',
      })

      if (userResult.success) {
        console.log('[AuthCallback] Database user created successfully')
      } else {
        console.error('[AuthCallback] Failed to create database user:', userResult.error)
        // Continue anyway - user can still use the app
        // We'll create DB record later if needed
      }
    } else {
      console.log('[AuthCallback] User already exists in database')
    }

    // ===== STEP 3: Redirect to next page =====
    
    // Later: Check if user completed onboarding
    // For now, always redirect to onboarding
    console.log('[AuthCallback] Redirecting to:', next)
    return NextResponse.redirect(new URL(next, requestUrl.origin))
    
  } catch (error: any) {
    console.error('[AuthCallback] Unexpected error:', error)
    return NextResponse.redirect(
      new URL(`/signin?error=unexpected`, requestUrl.origin)
    )
  }
}