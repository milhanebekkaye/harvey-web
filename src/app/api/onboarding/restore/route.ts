/**
 * GET /api/onboarding/restore
 *
 * Restore existing onboarding session after page refresh (Feature D Batch 4).
 * Returns projectId + messages for the most recent active project with an
 * onboarding discussion, or for the project specified by query param.
 * Also returns stored project and user data (extracted) so the client can
 * populate the shadow panel without calling the extraction API.
 * If the conversation contains PROJECT_INTAKE_COMPLETE, returns completed: true
 * so the client can redirect to dashboard.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { getProjectById } from '@/lib/projects/project-service'
import { getOnboardingDiscussion } from '@/lib/discussions/discussion-service'
import { getUserById } from '@/lib/users/user-service'
import { prisma } from '@/lib/db/prisma'
import { COMPLETION_MARKER } from '@/lib/ai/prompts'
import type { StoredMessage } from '@/types/api.types'

/** Build shadow-panel shape from DB project and user (avoids extraction API call on restore). */
function buildExtractedFromDb(
  project: Awaited<ReturnType<typeof getProjectById>>,
  user: Awaited<ReturnType<typeof getUserById>>
): { user: Record<string, unknown>; project: Record<string, unknown> } {
  const p = project as unknown as Record<string, unknown>
  const u = user as unknown as Record<string, unknown>
  return {
    user: {
      timezone: u?.timezone ?? undefined,
      workSchedule: u?.workSchedule ?? undefined,
      commute: u?.commute ?? undefined,
      availabilityWindows: u?.availabilityWindows ?? undefined,
      preferred_session_length: u?.preferred_session_length ?? undefined,
      communication_style: u?.communication_style ?? undefined,
      userNotes: u?.userNotes ?? undefined,
    },
    project: {
      title: p?.title ?? undefined,
      description: p?.description ?? undefined,
      goals: p?.goals ?? undefined,
      project_type: p?.project_type ?? undefined,
      target_deadline: p?.target_deadline instanceof Date ? p.target_deadline.toISOString() : p?.target_deadline ?? undefined,
      weekly_hours_commitment: p?.weekly_hours_commitment ?? undefined,
      tools_and_stack: p?.tools_and_stack ?? undefined,
      skill_level: p?.skill_level ?? undefined,
      motivation: p?.motivation ?? undefined,
      phases: p?.phases ?? undefined,
      projectNotes: p?.projectNotes ?? undefined,
    },
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectIdParam = searchParams.get('projectId')

    let projectId: string | undefined
    let discussion: Awaited<ReturnType<typeof getOnboardingDiscussion>> = null

    if (projectIdParam) {
      const project = await getProjectById(projectIdParam, user.id)
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
      projectId = project.id
      if (projectId) {
        discussion = await getOnboardingDiscussion(projectId, user.id)
      }
    } else {
      const projects = await prisma.project.findMany({
        where: { userId: user.id, status: 'active' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      for (const p of projects) {
        const d = await getOnboardingDiscussion(p.id, user.id)
        if (d?.messages && (d.messages as StoredMessage[]).length > 0) {
          discussion = d
          projectId = p.id
          break
        }
      }
    }

    if (!discussion || !(discussion.messages as StoredMessage[])?.length || projectId === undefined) {
      return NextResponse.json({ restore: false }, { status: 200 })
    }

    const messages = discussion.messages as StoredMessage[]
    const completed = messages.some(
      (m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.includes(COMPLETION_MARKER)
    )

    const fullProject = await getProjectById(projectId, user.id)
    const fullUser = fullProject ? await getUserById((fullProject as { userId: string }).userId) : null
    const extracted =
      fullProject && fullUser ? buildExtractedFromDb(fullProject, fullUser) : undefined

    return NextResponse.json({
      restore: true,
      projectId,
      messages,
      completed: completed || undefined,
      extracted,
    })
  } catch (error) {
    console.error('[OnboardingRestore] Error:', error)
    return NextResponse.json({ error: 'Failed to restore session' }, { status: 500 })
  }
}
