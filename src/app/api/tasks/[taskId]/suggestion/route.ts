/**
 * Smart Reschedule Suggestion API (Feature 3)
 *
 * GET /api/tasks/[taskId]/suggestion?skipReason=too_tired
 *
 * Returns a suggested date/time for rescheduling based on skip reason and availability.
 * No Claude — constraint-based logic.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'
import { getSmartRescheduleSuggestion } from '@/lib/tasks/smart-reschedule'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params
  const skipReason = request.nextUrl.searchParams.get('skipReason') ?? ''

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

    const task = await prisma.task.findFirst({
      where: { id: taskId, userId: user.id },
    })
    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found', code: 'TASK_NOT_FOUND' },
        { status: 404 }
      )
    }

    const suggestion = await getSmartRescheduleSuggestion(taskId, skipReason)
    return NextResponse.json(
      { success: true, suggestion: suggestion ?? null },
      { status: 200 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[SuggestionAPI] Error:', message)
    return NextResponse.json(
      { success: false, error: message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
