/**
 * Task Update API Route Handler
 *
 * PATCH /api/tasks/[taskId]
 *
 * Updates a specific task. Validates ownership before updating.
 * Automatically sets completedAt/skippedAt timestamps when status changes.
 *
 * URL Parameters:
 * - taskId: Task UUID to update
 *
 * Request Body:
 * - status?: 'pending' | 'in_progress' | 'completed' | 'skipped'
 * - title?: string
 * - description?: string
 *
 * Response:
 * - success: boolean
 * - task: DashboardTask - Updated task in display format
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Task } from '@prisma/client'
import { createClient } from '@/lib/auth/supabase-server'
import { updateTask, transformToDashboardTask } from '@/lib/tasks/task-service'
import type { DashboardTask } from '@/types/task.types'

/**
 * Request body for PATCH /api/tasks/[taskId]
 */
interface UpdateTaskRequest {
  status?: 'pending' | 'in_progress' | 'completed' | 'skipped'
  title?: string
  description?: string
}

/**
 * Response type for PATCH /api/tasks/[taskId]
 */
interface UpdateTaskResponse {
  success: boolean
  task: DashboardTask
  /** When task was set to skipped, IDs of tasks that were cascade-skipped (depend on this task). */
  downstreamSkippedIds?: string[]
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params
  console.log('[TaskUpdateAPI] ========== Updating task:', taskId, '==========')

  try {
    // ===== STEP 1: Authenticate User =====
    console.log('[TaskUpdateAPI] Step 1: Authenticating user')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[TaskUpdateAPI] Authentication failed:', authError?.message)
      return NextResponse.json(
        { success: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    console.log('[TaskUpdateAPI] User authenticated:', user.email)

    // ===== STEP 2: Parse Request Body =====
    console.log('[TaskUpdateAPI] Step 2: Parsing request body')

    let body: UpdateTaskRequest
    try {
      body = await request.json()
    } catch {
      console.error('[TaskUpdateAPI] Invalid JSON in request body')
      return NextResponse.json(
        { success: false, error: 'Invalid request body', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    // Validate status if provided
    const validStatuses = ['pending', 'in_progress', 'completed', 'skipped']
    if (body.status && !validStatuses.includes(body.status)) {
      console.error('[TaskUpdateAPI] Invalid status:', body.status)
      return NextResponse.json(
        { success: false, error: 'Invalid status', code: 'INVALID_STATUS' },
        { status: 400 }
      )
    }

    console.log('[TaskUpdateAPI] Update data:', body)

    // ===== STEP 3: Update Task =====
    console.log('[TaskUpdateAPI] Step 3: Updating task')

    const result = await updateTask(taskId, user.id, body)

    if (!result.success || !result.data) {
      console.error('[TaskUpdateAPI] Failed to update task:', result.error?.message)

      if (result.error?.code === 'TASK_NOT_FOUND') {
        return NextResponse.json(
          { success: false, error: 'Task not found', code: 'TASK_NOT_FOUND' },
          { status: 404 }
        )
      }

      return NextResponse.json(
        { success: false, error: result.error?.message || 'Failed to update task', code: 'INTERNAL_ERROR' },
        { status: 500 }
      )
    }

    // ===== STEP 4: Transform and Return =====
    console.log('[TaskUpdateAPI] Step 4: Preparing response')

    const taskData = result.data as Task & { downstreamSkippedIds?: string[] }
    const dashboardTask = transformToDashboardTask(taskData)

    console.log('[TaskUpdateAPI] Task updated successfully:', {
      id: dashboardTask.id,
      status: dashboardTask.status,
      downstreamSkippedIds: taskData.downstreamSkippedIds?.length,
    })
    console.log('[TaskUpdateAPI] ========== Update complete ==========')

    const response: UpdateTaskResponse = {
      success: true,
      task: dashboardTask,
      ...(taskData.downstreamSkippedIds?.length
        ? { downstreamSkippedIds: taskData.downstreamSkippedIds }
        : {}),
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[TaskUpdateAPI] Error updating task:', errorMessage)

    return NextResponse.json(
      { success: false, error: errorMessage || 'Failed to update task', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
