/**
 * OAuth Callback Route Handler
 * 
 * Handles the redirect after OAuth authentication (Google) and magic link.
 * 
 * THREE-STEP PROCESS:
 * 1. Exchange OAuth code for Supabase session
 * 2. Create database user if doesn't exist
 * 3. Determine redirect: if user has a project → /dashboard, else → /onboarding (or explicit next param)
 * 
 * Flow:
 * 1. User authenticates with Google or clicks magic link
 * 2. Redirects here with code
 * 3. We exchange code for session (Supabase Auth)
 * 4. We check if user exists in database; if not, create record
 * 5. If explicit next query param → redirect there; else if user has any project → /dashboard, else → /onboarding
 */

import { createClient } from '@/lib/auth/supabase-server'
import { createUser, userExists } from '@/lib/users/user-service'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** Returns true if the user has at least one project (any status). */
async function userHasProject(userId: string): Promise<boolean> {
  const count = await prisma.project.count({
    where: { userId },
  })
  return count > 0
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const nextParam = requestUrl.searchParams.get('next')

  console.log('[AuthCallback] Callback received:', { 
    hasCode: !!code, 
    nextParam: nextParam ?? '(none)' 
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
    
    const exists = await userExists(data.user.id)
    
    if (!exists) {
      console.log('[AuthCallback] User not in database, creating record')
      
      const userName = data.user.user_metadata?.full_name || 
                       data.user.user_metadata?.name || 
                       null

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
      }
    } else {
      console.log('[AuthCallback] User already exists in database')
    }

    // ===== STEP 3: Determine redirect target =====
    // If explicit next param was provided, use it; otherwise send returning users to dashboard, new users to onboarding.
    let redirectTarget: string
    if (nextParam != null && nextParam.trim() !== '') {
      redirectTarget = nextParam.startsWith('/') ? nextParam : `/${nextParam}`
      console.log('[AuthCallback] Using explicit next param:', redirectTarget)
    } else {
      const hasProject = await userHasProject(data.user.id)
      redirectTarget = hasProject ? '/dashboard' : '/onboarding'
      console.log('[AuthCallback] Redirecting to:', redirectTarget, '(hasProject:', hasProject, ')')
    }

    return NextResponse.redirect(new URL(redirectTarget, requestUrl.origin))
    
  } catch (error: any) {
    console.error('[AuthCallback] Unexpected error:', error)
    return NextResponse.redirect(
      new URL(`/signin?error=unexpected`, requestUrl.origin)
    )
  }
}