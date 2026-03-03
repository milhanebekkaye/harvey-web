/**
 * GET /api/projects/[projectId]
 * PATCH /api/projects/[projectId]
 *
 * Get or update a single project. User must own the project.
 * Used by the Project Details page.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { getProjectById, updateProject } from '@/lib/projects/project-service'
import type { UpdateProjectData } from '@/lib/projects/project-service'

const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
const STATUSES = ['active', 'paused', 'completed'] as const
const MAX_TAGS = 10
const TAG_MAX_LENGTH = 50
const WEEKLY_HOURS_MIN = 1
const WEEKLY_HOURS_MAX = 168

function validatePatchBody(body: unknown): { data: UpdateProjectData; error: string | null } {
  if (body === null || typeof body !== 'object') {
    return { data: {}, error: 'Request body must be an object' }
  }
  const obj = body as Record<string, unknown>
  const data: UpdateProjectData = {}

  if (obj.title !== undefined) {
    if (typeof obj.title !== 'string') {
      return { data: {}, error: 'title must be a string' }
    }
    data.title = obj.title.trim() || (null as unknown as string)
  }
  if (obj.description !== undefined) {
    if (obj.description !== null && typeof obj.description !== 'string') {
      return { data: {}, error: 'description must be a string or null' }
    }
    data.description = obj.description === '' ? null : (obj.description as string)
  }
  if (obj.goals !== undefined) {
    if (obj.goals !== null && typeof obj.goals !== 'string') {
      return { data: {}, error: 'goals must be a string or null' }
    }
    data.goals = obj.goals === '' ? null : (obj.goals as string)
  }
  if (obj.status !== undefined) {
    if (typeof obj.status !== 'string' || !STATUSES.includes(obj.status as (typeof STATUSES)[number])) {
      return { data: {}, error: `status must be one of: ${STATUSES.join(', ')}` }
    }
    data.status = obj.status as string
  }
  if (obj.target_deadline !== undefined) {
    if (obj.target_deadline !== null) {
      const d = new Date(obj.target_deadline as string)
      if (Number.isNaN(d.getTime())) {
        return { data: {}, error: 'target_deadline must be a valid ISO date string or null' }
      }
      data.target_deadline = d
    } else {
      data.target_deadline = null
    }
  }
  if (obj.skill_level !== undefined) {
    if (obj.skill_level !== null) {
      if (typeof obj.skill_level !== 'string' || !SKILL_LEVELS.includes(obj.skill_level as (typeof SKILL_LEVELS)[number])) {
        return { data: {}, error: `skill_level must be one of: ${SKILL_LEVELS.join(', ')} or null` }
      }
      data.skill_level = obj.skill_level as string
    } else {
      data.skill_level = null
    }
  }
  if (obj.tools_and_stack !== undefined) {
    if (!Array.isArray(obj.tools_and_stack)) {
      return { data: {}, error: 'tools_and_stack must be an array of strings' }
    }
    if (obj.tools_and_stack.length > MAX_TAGS) {
      return { data: {}, error: `tools_and_stack may have at most ${MAX_TAGS} items` }
    }
    const tags: string[] = []
    const seen = new Set<string>()
    for (const t of obj.tools_and_stack) {
      if (typeof t !== 'string') {
        return { data: {}, error: 'tools_and_stack must contain only strings' }
      }
      const trimmed = t.trim()
      if (!trimmed) continue
      if (trimmed.length > TAG_MAX_LENGTH) {
        return { data: {}, error: `Each tag must be at most ${TAG_MAX_LENGTH} characters` }
      }
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      tags.push(trimmed)
    }
    data.tools_and_stack = tags
  }
  if (obj.project_type !== undefined) {
    if (obj.project_type !== null) {
      if (typeof obj.project_type !== 'string') {
        return { data: {}, error: 'project_type must be a string or null' }
      }
      data.project_type = obj.project_type as string
    } else {
      data.project_type = null
    }
  }
  if (obj.weekly_hours_commitment !== undefined) {
    if (obj.weekly_hours_commitment !== null) {
      const n = Number(obj.weekly_hours_commitment)
      if (!Number.isInteger(n) || n < WEEKLY_HOURS_MIN || n > WEEKLY_HOURS_MAX) {
        return { data: {}, error: `weekly_hours_commitment must be an integer between ${WEEKLY_HOURS_MIN} and ${WEEKLY_HOURS_MAX}` }
      }
      data.weekly_hours_commitment = n
    } else {
      data.weekly_hours_commitment = null
    }
  }
  if (obj.motivation !== undefined) {
    if (obj.motivation !== null && typeof obj.motivation !== 'string') {
      return { data: {}, error: 'motivation must be a string or null' }
    }
    data.motivation = obj.motivation === '' ? null : (obj.motivation as string)
  }

  const PHASE_STATUSES = ['completed', 'active', 'future'] as const
  if (obj.phases !== undefined) {
    if (obj.phases !== null && typeof obj.phases !== 'object') {
      return { data: {}, error: 'phases must be an object or null' }
    }
    if (obj.phases !== null) {
      const p = obj.phases as Record<string, unknown>
      if (!Array.isArray(p.phases)) {
        return { data: {}, error: 'phases.phases must be an array' }
      }
      const phases: Array<{ id?: number; title?: string; goal?: string | null; deadline?: string | null; status?: string }> = []
      for (let i = 0; i < p.phases.length; i++) {
        const entry = p.phases[i]
        if (entry === null || typeof entry !== 'object') {
          return { data: {}, error: `phases.phases[${i}] must be an object` }
        }
        const e = entry as Record<string, unknown>
        const phase: { id?: number; title?: string; goal?: string | null; deadline?: string | null; status?: string } = {}
        if (e.id !== undefined) phase.id = Number(e.id)
        if (e.title !== undefined) phase.title = typeof e.title === 'string' ? e.title : ''
        if (e.goal !== undefined) phase.goal = e.goal === null || e.goal === '' ? null : (e.goal as string)
        if (e.deadline !== undefined) phase.deadline = e.deadline === null || e.deadline === '' ? null : (e.deadline as string)
        if (e.status !== undefined) {
          const s = String(e.status)
          if (!PHASE_STATUSES.includes(s as (typeof PHASE_STATUSES)[number])) {
            return { data: {}, error: `phases.phases[${i}].status must be one of: ${PHASE_STATUSES.join(', ')}` }
          }
          phase.status = s
        }
        phases.push(phase)
      }
      const active_phase_id = p.active_phase_id !== undefined ? Number(p.active_phase_id) : undefined
      data.phases = { phases, ...(active_phase_id !== undefined && !Number.isNaN(active_phase_id) ? { active_phase_id } : {}) }
    } else {
      data.phases = null
    }
  }

  if (obj.projectNotes !== undefined) {
    if (obj.projectNotes !== null && !Array.isArray(obj.projectNotes)) {
      return { data: {}, error: 'projectNotes must be an array or null' }
    }
    if (obj.projectNotes !== null) {
      const arr = obj.projectNotes as unknown[]
      const notes: Array<{ note: string; extracted_at?: string }> = []
      for (let i = 0; i < arr.length; i++) {
        const entry = arr[i]
        if (entry === null || typeof entry !== 'object') {
          return { data: {}, error: `projectNotes[${i}] must be an object` }
        }
        const e = entry as Record<string, unknown>
        const note = String(e.note ?? '')
        const extracted_at = e.extracted_at != null ? String(e.extracted_at) : undefined
        notes.push({ note, ...(extracted_at ? { extracted_at } : {}) })
      }
      data.projectNotes = notes
    } else {
      data.projectNotes = null
    }
  }

  return { data, error: null }
}

/** Serialize project for JSON (dates to ISO strings) */
function projectToJson(project: Awaited<ReturnType<typeof getProjectById>>) {
  if (!project) return null
  return {
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    target_deadline: project.target_deadline ? project.target_deadline.toISOString() : null,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
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

    const { projectId } = await params
    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID required', code: 'BAD_REQUEST' },
        { status: 400 }
      )
    }

    const project = await getProjectById(projectId, user.id)
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    return NextResponse.json(projectToJson(project))
  } catch (err) {
    console.error('[ProjectsAPI] GET error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
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

    const { projectId } = await params
    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID required', code: 'BAD_REQUEST' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { data, error: validationError } = validatePatchBody(body)
    if (validationError) {
      return NextResponse.json(
        { error: validationError, code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    if (Object.keys(data).length === 0) {
      const project = await getProjectById(projectId, user.id)
      if (!project) {
        return NextResponse.json(
          { error: 'Project not found', code: 'NOT_FOUND' },
          { status: 404 }
        )
      }
      return NextResponse.json(projectToJson(project))
    }

    const result = await updateProject(projectId, user.id, data)
    if (!result.success) {
      if (result.error?.code === 'PROJECT_NOT_FOUND') {
        return NextResponse.json(
          { error: result.error.message, code: result.error.code },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { error: result.error?.message ?? 'Update failed' },
        { status: 500 }
      )
    }

    return NextResponse.json(projectToJson(result.project))
  } catch (err) {
    console.error('[ProjectsAPI] PATCH error:', err)
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    )
  }
}
