/**
 * GET /api/user/me
 *
 * Returns the current user's profile from the DB (e.g. name).
 * Used by onboarding screens to show the name stored on the user document
 * rather than session metadata or email prefix.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { getUserById } from '@/lib/users/user-service'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dbUser = await getUserById(user.id)
    if (!dbUser) {
      return NextResponse.json({ name: null }, { status: 200 })
    }

    return NextResponse.json({
      name: dbUser.name ?? null,
    })
  } catch (error) {
    console.error('[UserMeAPI] GET error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
