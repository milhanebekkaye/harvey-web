/**
 * Today's Progress API (Feature 3)
 *
 * GET /api/progress/today
 *
 * Returns completed/skipped/pending counts and next task for today.
 * No Claude — pure DB query.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { getTodayProgress } from '@/lib/tasks/task-service'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    const result = await getTodayProgress(user.id)
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error?.message, code: result.error?.code },
        { status: result.error?.code === 'NO_PROJECT' ? 404 : 500 }
      )
    }

    return NextResponse.json({ success: true, data: result.data }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[ProgressTodayAPI] Error:', message)
    return NextResponse.json(
      { success: false, error: message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
