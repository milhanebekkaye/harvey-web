/**
 * PATCH /api/onboarding/update-field
 *
 * Update a single extracted field (user or project).
 * Used for inline editing in the Shadow Panel (Feature D Step 7).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { getProjectById } from '@/lib/projects/project-service'
import { updateUser } from '@/lib/users/user-service'
import { updateProject } from '@/lib/projects/project-service'
import type { UpdateUserData } from '@/types/user.types'
import type { UpdateProjectData } from '@/lib/projects/project-service'

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { projectId, scope, field, value } = body as {
      projectId?: string
      scope?: string
      field?: string
      value?: unknown
    }

    console.log('[UpdateField] Updating field:', { projectId, scope, field, value: value !== undefined ? '[present]' : 'undefined' })

    if (!projectId || !scope || field === undefined || field === '') {
      return NextResponse.json({ error: 'Missing required fields: projectId, scope, field' }, { status: 400 })
    }

    if (scope !== 'user' && scope !== 'project') {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
    }

    const project = await getProjectById(projectId, authUser.id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (scope === 'user') {
      const payload: UpdateUserData = { [field]: value as never }
      const result = await updateUser(authUser.id, payload)
      if (!result.success) {
        console.error('[UpdateField] User update failed:', result.error)
        return NextResponse.json({ error: result.error?.message ?? 'Update failed' }, { status: 500 })
      }
    } else {
      let projectValue: unknown = value
      if ((field === 'target_deadline' || field === 'schedule_start_date') && value != null) {
        projectValue = typeof value === 'string' ? new Date(value) : value
      }
      const payload: UpdateProjectData = { [field]: projectValue as never }
      const result = await updateProject(projectId, authUser.id, payload)
      if (!result.success) {
        console.error('[UpdateField] Project update failed:', result.error)
        return NextResponse.json({ error: result.error?.message ?? 'Update failed' }, { status: 500 })
      }
    }

    console.log('[UpdateField] Successfully updated:', { scope, field })

    return NextResponse.json({
      success: true,
      updated: { scope, field, value },
    })
  } catch (error) {
    console.error('[UpdateField] Error:', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
