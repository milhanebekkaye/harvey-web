/**
 * Tasks API Route Handler
 *
 * GET /api/tasks
 *
 * Fetches all tasks for the authenticated user's active project.
 * Tasks are grouped by date: OVERDUE, TODAY, TOMORROW, individual days, NEXT_WEEK, LATER, UNSCHEDULED.
 *
 * Query Parameters:
 * - projectId (optional): Specific project to fetch tasks for
 *
 * Response:
 * - tasks: TaskGroups - Tasks grouped by date category
 * - projectId: string - Active project ID
 * - projectTitle: string - Active project title
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { getGroupedTasks } from '@/lib/tasks/task-service'
import type { TaskGroups } from '@/lib/types/task.types'

/**
 * Response type for GET /api/tasks
 */
interface TasksApiResponse {
  tasks: TaskGroups
  projectId: string
  projectTitle: string
}

export async function GET(request: NextRequest) {
  console.log('[TasksAPI] ========== Fetching tasks ==========')

  try {
    // ===== STEP 1: Authenticate User =====
    console.log('[TasksAPI] Step 1: Authenticating user')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[TasksAPI] Authentication failed:', authError?.message)
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    console.log('[TasksAPI] User authenticated:', user.email)

    // ===== STEP 2: Get Optional Query Params =====
    const searchParams = request.nextUrl.searchParams
    const projectIdParam = searchParams.get('projectId')

    if (projectIdParam) {
      console.log('[TasksAPI] Specific projectId requested:', projectIdParam)
      // TODO: In future, support fetching tasks for a specific project
      // For now, we use the active project
    }

    // ===== STEP 3: Get Grouped Tasks =====
    console.log('[TasksAPI] Step 2: Fetching grouped tasks')

    const result = await getGroupedTasks(user.id)

    if (!result.success || !result.data) {
      console.error('[TasksAPI] Failed to get tasks:', result.error?.message)

      // No active project is a common case (user hasn't completed onboarding)
      if (result.error?.code === 'NO_PROJECT') {
        return NextResponse.json(
          { error: 'No active project found', code: 'NO_PROJECT' },
          { status: 404 }
        )
      }

      return NextResponse.json(
        { error: result.error?.message || 'Failed to fetch tasks', code: 'INTERNAL_ERROR' },
        { status: 500 }
      )
    }

    const { tasks, project } = result.data

    // ===== STEP 4: Return Response =====
    console.log('[TasksAPI] Returning tasks:', {
      overdue: tasks.overdue.length,
      today: tasks.today.length,
      tomorrow: tasks.tomorrow.length,
      weekDays: tasks.weekDays.length,
      nextWeek: tasks.nextWeek.length,
      later: tasks.later.length,
      unscheduled: tasks.unscheduled.length,
      projectTitle: project.title,
    })
    console.log('[TasksAPI] ========== Tasks fetch complete ==========')

    const response: TasksApiResponse = {
      tasks,
      projectId: project.id,
      projectTitle: project.title,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[TasksAPI] Error fetching tasks:', errorMessage)

    return NextResponse.json(
      { error: errorMessage || 'Failed to fetch tasks', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
