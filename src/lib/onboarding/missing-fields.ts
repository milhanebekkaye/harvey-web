/**
 * Onboarding missing-fields: two-tier fields and guidance for Harvey.
 *
 * Blocking fields must be filled before "Build my schedule" activates.
 * Enriching fields Harvey should ask about naturally when the conversation allows.
 */

import { getProjectById } from '@/lib/projects/project-service'
import { getUserById } from '@/lib/users/user-service'

/** Fields that MUST be filled before "Build my schedule" button activates. */
export const BLOCKING_FIELDS = [
  'description',
  'availabilityWindows',
  'goals',
  'schedule_duration_days',
] as const

/** Fields Harvey should ask about if the conversation allows — nice to have. */
export const ENRICHING_FIELDS = [
  'preferred_session_length',
  'weekly_hours_commitment',
  'task_preference',
  'tools_and_stack',
  'skill_level',
  'motivation',
  'phases',
  'projectNotes',
  'userNotes',
  'target_deadline',
  'energy_peak',
  'schedule_start_date',
] as const

/** Human-readable guidance per field for the system prompt. */
export const fieldToNaturalDescription: Record<string, string> = {
  tools_and_stack:
    'What tools or methods they are using for this project',
  skill_level:
    'Their experience level with the tech stack they described (beginner / intermediate / advanced)',
  availabilityWindows:
    'When they can actually work on this project (specific time blocks)',
  description: 'What the project is — a clear description of what they are building',
  preferred_session_length:
    'How long they like to work in one sitting before taking a break',
  weekly_hours_commitment:
    'Roughly how many hours per week they can commit to this project',
  energy_peak:
    'Whether they are most productive in the morning, afternoon, or evening',
  schedule_start_date:
    'When they want to start working on this schedule (today, tomorrow, or a specific date)',
  schedule_duration_days:
    'How long they want to plan the schedule for (e.g. 1 week, 2 weeks, or full timeline until deadline)',
}


const LOG_PREFIX = '[MissingFields]'

/**
 * Load fresh project and user from DB and compute which blocking/enriching fields are still missing.
 */
export async function computeMissingFields(
  projectId: string,
  userId: string
): Promise<{ blocking: string[]; enriching: string[] }> {
  console.log(LOG_PREFIX, 'computeMissingFields start', { projectId, userId })

  let project = null
  let user = null
  try {
    project = await getProjectById(projectId, userId)
    user = await getUserById(userId)
  } catch (err) {
    console.error(LOG_PREFIX, 'Error loading project/user:', err)
    return { blocking: [], enriching: [] }
  }

  console.log(LOG_PREFIX, 'Loaded from DB:', {
    projectFound: !!project,
    userFound: !!user,
  })

  const blocking: string[] = []
  const enriching: string[] = []

  // Blocking: description (project)
  if (!project?.description || String(project.description).trim() === '') {
    blocking.push('description')
  }

  // Blocking: availabilityWindows (user) — at least one window
  const windows = user?.availabilityWindows as
    | Array<{ days?: string[]; start_time?: string; end_time?: string }>
    | null
    | undefined
  if (!Array.isArray(windows) || windows.length === 0) {
    blocking.push('availabilityWindows')
  }

  // Blocking: schedule_duration_days (project) — user must say how long to plan (0 = full timeline)
  const scheduleDurationDays = project && 'schedule_duration_days' in project ? (project as { schedule_duration_days?: number | null }).schedule_duration_days : undefined
  if (scheduleDurationDays === undefined || scheduleDurationDays === null) {
    blocking.push('schedule_duration_days')
  }

  // Enriching: preferred_session_length (user)
  if (
    user?.preferred_session_length == null ||
    Number(user.preferred_session_length) <= 0
  ) {
    enriching.push('preferred_session_length')
  }

  // Enriching: weekly_hours_commitment (project)
  if (
    project?.weekly_hours_commitment == null ||
    Number(project.weekly_hours_commitment) <= 0
  ) {
    enriching.push('weekly_hours_commitment')
  }

  // Enriching: task_preference (project) — use bracket access so we don't depend on Prisma client typings
  const taskPref = project && 'task_preference' in project ? (project as { task_preference?: string | null }).task_preference : undefined
  if (!taskPref || String(taskPref).trim() === '') {
    enriching.push('task_preference')
  }

  // Enriching: tools_and_stack (project)
  if (!project?.tools_and_stack || project.tools_and_stack.length === 0) {
    enriching.push('tools_and_stack')
  }

  // Enriching: skill_level (project)
  if (!project?.skill_level || String(project.skill_level).trim() === '') {
    enriching.push('skill_level')
  }

  // Enriching: motivation (project)
  if (!project?.motivation || String(project.motivation).trim() === '') {
    enriching.push('motivation')
  }

  // Enriching: phases (project) — Json type
  const phases = project?.phases
  const hasPhases = phases != null && (Array.isArray(phases) ? phases.length > 0 : typeof phases === 'object' && Object.keys(phases as object).length > 0)
  if (!hasPhases) {
    enriching.push('phases')
  }

  // Enriching: projectNotes (project) — Json type
  const projectNotes = project?.projectNotes
  const hasProjectNotes = projectNotes != null && (Array.isArray(projectNotes) ? projectNotes.length > 0 : typeof projectNotes === 'object' && Object.keys(projectNotes as object).length > 0)
  if (!hasProjectNotes) {
    enriching.push('projectNotes')
  }

  // Enriching: target_deadline (project)
  if (!project?.target_deadline) {
    enriching.push('target_deadline')
  }

  // Enriching: userNotes (user) — Json type
  const userNotes = user?.userNotes
  const hasUserNotes = userNotes != null && (Array.isArray(userNotes) ? userNotes.length > 0 : typeof userNotes === 'object' && Object.keys(userNotes as object).length > 0)
  if (!hasUserNotes) {
    enriching.push('userNotes')
  }

  // Enriching: energy_peak (user) — when user is most productive
  const energyPeak = user && 'energy_peak' in user ? (user as { energy_peak?: string | null }).energy_peak : undefined
  if (!energyPeak || String(energyPeak).trim() === '') {
    enriching.push('energy_peak')
  }

  // Enriching: schedule_start_date (project) — when they want to start the schedule
  const scheduleStartDate = project && 'schedule_start_date' in project ? (project as { schedule_start_date?: Date | string | null }).schedule_start_date : undefined
  if (scheduleStartDate == null) {
    enriching.push('schedule_start_date')
  }

  console.log(LOG_PREFIX, 'Result:', {
    blocking,
    enriching,
    blockingCount: blocking.length,
    enrichingCount: enriching.length,
  })
  return { blocking, enriching }
}

/**
 * Build the missing-fields guidance string for the onboarding system prompt.
 */
export function buildMissingFieldsGuidance(
  blocking: string[],
  enriching: string[]
): string {
  if (blocking.length === 0 && enriching.length === 0) {
    console.log(LOG_PREFIX, 'buildMissingFieldsGuidance: all info needed, no missing fields')
    return 'You have all the information needed. Guide the user toward building their schedule.'
  }

  console.log(LOG_PREFIX, 'buildMissingFieldsGuidance:', {
    blockingCount: blocking.length,
    enrichingCount: enriching.length,
    blocking,
    enriching,
  })

  const lines: string[] = [
    '',
    'INFORMATION STILL NEEDED:',
  ]

  if (blocking.length > 0) {
    lines.push(
      'Critical (ask before user can build schedule):',
      ...blocking.map((f) => fieldToNaturalDescription[f] ?? f),
      ''
    )
  }

  if (enriching.length > 0) {
    lines.push(
      'Helpful (ask naturally if conversation allows):',
      ...enriching.map((f) => fieldToNaturalDescription[f] ?? f),
      ''
    )
  }

  lines.push(
    'Weave questions about these into the conversation naturally. Do NOT list them. Do NOT ask more than one at a time. Sound like a coach who is curious, not a form.'
  )

  return lines.join('\n')
}
