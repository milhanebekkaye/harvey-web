/**
 * PATCH /api/user/onboarding
 *
 * Authenticated endpoint to save onboarding questions (onboarding_reason,
 * current_work, work_style, biggest_challenge, coaching_style, experience_level). Used by /onboarding/questions.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { updateUser } from '@/lib/users/user-service'
import type { UpdateUserData } from '@/types/user.types'

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
    const partialPayload: UpdateUserData = {}

    if (typeof body.onboarding_reason === 'string' && body.onboarding_reason.trim() !== '') {
      partialPayload.onboarding_reason = body.onboarding_reason.trim()
    }
    if (typeof body.current_work === 'string' && body.current_work.trim() !== '') {
      partialPayload.current_work = body.current_work.trim()
    }
    if (Array.isArray(body.work_style) && body.work_style.length > 0) {
      partialPayload.work_style = body.work_style
    }
    if (typeof body.biggest_challenge === 'string' && body.biggest_challenge.trim() !== '') {
      partialPayload.biggest_challenge = body.biggest_challenge.trim()
    }
    if (typeof body.coaching_style === 'string' && body.coaching_style.trim() !== '') {
      partialPayload.coaching_style = body.coaching_style.trim()
    }
    if (typeof body.experience_level === 'string' && body.experience_level.trim() !== '') {
      partialPayload.experience_level = body.experience_level.trim()
    }

    if (Object.keys(partialPayload).length === 0) {
      return NextResponse.json({ success: true }, { status: 200 })
    }

    const result = await updateUser(user.id, partialPayload)

    if (!result.success) {
      console.error('[UserOnboardingAPI] Update failed:', result.error)
      return NextResponse.json(
        { error: result.error?.message ?? 'Update failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[UserOnboardingAPI] Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
