/**
 * Task Reschedule API (Feature 3)
 *
 * POST /api/tasks/[taskId]/reschedule
 *
 * Moves a task to a suggested date/time. Used when user accepts
 * a reschedule suggestion from the skip-feedback flow.
 * Calls existing executeModifySchedule logic (no chat router).
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'
import { executeModifySchedule } from '@/lib/chat/tools/modifySchedule'

interface RescheduleBody {
  suggestedDate: string // YYYY-MM-DD
  suggestedTime: string // HH:MM 24h
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params

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

    let body: RescheduleBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    const { suggestedDate, suggestedTime } = body
    if (!suggestedDate || !suggestedTime) {
      return NextResponse.json(
        { success: false, error: 'suggestedDate and suggestedTime required', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    const task = await prisma.task.findFirst({
      where: { id: taskId, userId: user.id },
      select: { projectId: true },
    })

    if (!task?.projectId) {
      return NextResponse.json(
        { success: false, error: 'Task not found', code: 'TASK_NOT_FOUND' },
        { status: 404 }
      )
    }

    const result = await executeModifySchedule(
      {
        task_id: taskId,
        new_date: suggestedDate,
        new_start_time: suggestedTime,
      },
      task.projectId,
      user.id
    )

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.message,
          code: 'RESCHEDULE_FAILED',
          conflicts: result.conflicts,
          dependency_issues: result.dependency_issues,
        },
        { status: 400 }
      )
    }

    // Mark task as pending again so it appears on the timeline
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'pending', skippedAt: null, updatedAt: new Date() },
    })

    return NextResponse.json({ success: true, message: result.message }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[RescheduleAPI] Error:', message)
    return NextResponse.json(
      { success: false, error: message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
