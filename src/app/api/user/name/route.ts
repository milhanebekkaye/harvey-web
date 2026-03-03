/**
 * PATCH /api/user/name
 *
 * Authenticated endpoint to update the current user's name in the users table.
 * Used by the /onboarding/welcome screen after signup.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { updateUser } from '@/lib/users/user-service'

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim() : null

    if (name === null || name === '') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const result = await updateUser(user.id, { name })

    if (!result.success) {
      console.error('[UserNameAPI] Update failed:', result.error)
      return NextResponse.json(
        { error: result.error?.message ?? 'Update failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[UserNameAPI] Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
