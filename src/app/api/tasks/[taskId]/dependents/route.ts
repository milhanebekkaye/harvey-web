/**
 * GET /api/tasks/[taskId]/dependents
 *
 * Returns tasks that depend on the given task (have taskId in their depends_on).
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'

export async function GET(
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
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    const result = await prisma.task.findMany({
      where: {
        userId: user.id,
        depends_on: { has: taskId },
      },
      select: { id: true, title: true },
    })

    console.log(
      `[GET /api/tasks/${taskId}/dependents] Found ${result.length} dependent(s) for user ${user.id}`
    )

    return NextResponse.json({ dependents: result })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[GET /api/tasks/${taskId}/dependents] Error:`, errorMessage)
    return NextResponse.json(
      { error: errorMessage, code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
