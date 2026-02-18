/**
 * Project Details Page — View and edit what Harvey knows about the project.
 * Server component: fetches project, then renders client form.
 */

import { createClient } from '@/lib/auth/supabase-server'
import { getProjectById } from '@/lib/projects/project-service'
import { redirect } from 'next/navigation'
import { ProjectDetailsForm } from '@/components/dashboard/ProjectDetailsForm'
import type { SerializedProject } from '@/components/dashboard/ProjectDetailsForm'

export default async function ProjectDetailsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/signin')
  }

  const { projectId } = await params
  const project = await getProjectById(projectId, user.id)

  if (!project) {
    redirect('/dashboard')
  }

  const rawPhases = project.phases as SerializedProject['phases'] | null
  const rawNotes = project.projectNotes
  let projectNotes: SerializedProject['projectNotes'] = null
  if (Array.isArray(rawNotes) && rawNotes.length > 0) {
    projectNotes = rawNotes.map((entry) =>
      typeof entry === 'object' && entry != null && 'note' in entry
        ? { note: String((entry as { note: string }).note), extracted_at: (entry as { extracted_at?: string }).extracted_at }
        : { note: String(entry) }
    )
  } else if (typeof rawNotes === 'string' && rawNotes.trim()) {
    projectNotes = [{ note: rawNotes.trim() }]
  }

  const serialized: SerializedProject = {
    id: project.id,
    userId: project.userId,
    title: project.title,
    description: project.description,
    goals: project.goals,
    status: project.status,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    target_deadline: project.target_deadline
      ? project.target_deadline.toISOString()
      : null,
    skill_level: project.skill_level,
    tools_and_stack: project.tools_and_stack ?? [],
    project_type: project.project_type,
    weekly_hours_commitment: project.weekly_hours_commitment,
    motivation: project.motivation,
    phases: rawPhases ?? null,
    projectNotes,
    milestones: (project.milestones as SerializedProject['milestones']) ?? null,
    schedule_duration_days: project.schedule_duration_days ?? null,
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] overflow-y-auto">
      <ProjectDetailsForm initialProject={serialized} />
    </div>
  )
}
