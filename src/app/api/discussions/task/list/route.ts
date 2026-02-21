/**
 * List task discussions for a project.
 *
 * GET /api/discussions/task/list?projectId=
 *
 * Returns all task-type discussions for the project (for nav panel after refresh).
 * Skips discussions whose task was deleted (task relation null).
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'
import { listTaskDiscussions } from '@/lib/discussions/discussion-service'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId query param required', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
    })
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found', code: 'NOT_OWNER' },
        { status: 403 }
      )
    }

    const discussions = await listTaskDiscussions(projectId, user.id)

    return NextResponse.json({ discussions }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[DiscussionTaskListAPI] GET error:', message)
    return NextResponse.json(
      { error: message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
