import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'
import { getActiveProject } from '@/lib/tasks/task-service'
import { getTimelineData } from '@/lib/timeline/get-timeline-data'

export async function GET(request: NextRequest) {
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

    const projectIdParam = request.nextUrl.searchParams.get('projectId')

    let projectId = projectIdParam

    if (projectId) {
      const ownedProject = await prisma.project.findFirst({
        where: {
          id: projectId,
          userId: user.id,
        },
        select: { id: true },
      })

      if (!ownedProject) {
        return NextResponse.json(
          { success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' },
          { status: 404 }
        )
      }
    } else {
      const activeProject = await getActiveProject(user.id)
      if (!activeProject.success || !activeProject.data) {
        return NextResponse.json(
          { success: false, error: 'No active project found', code: 'NO_PROJECT' },
          { status: 404 }
        )
      }

      projectId = activeProject.data.id
    }

    const timeline = await getTimelineData(projectId, user.id)

    return NextResponse.json(
      {
        success: true,
        projectId,
        ...timeline,
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch timeline',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    )
  }
}
