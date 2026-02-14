/**
 * ProjectShadowPanel – Feature D (Shadow Panel) Step 5
 *
 * Live-updating panel that displays extracted user/project fields as Harvey
 * extracts them during onboarding. Three sections: Project Info, Your Schedule, Preferences.
 */

'use client'

import { useState } from 'react'

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function formatTime(time: string): string {
  if (!time || typeof time !== 'string') return '—'
  const [hStr, mStr] = time.trim().split(':')
  const h = parseInt(hStr ?? '0', 10)
  const m = parseInt(mStr ?? '0', 10)
  if (Number.isNaN(h)) return time
  if (h === 0) return `12:${m || '00'}am`
  if (h === 12) return `12:${m || '00'}pm`
  return `${h > 12 ? h - 12 : h}${m ? ':' + String(m).padStart(2, '0') : ''}${h >= 12 ? 'pm' : 'am'}`
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(d)
  } catch {
    return iso
  }
}

/** Returns true if the given day string (e.g. "Monday" or "Mon") matches the short label (e.g. "Mon"). */
function dayMatches(dayLabel: string, blockDay: string): boolean {
  if (!blockDay) return false
  const blockLower = String(blockDay).toLowerCase()
  const labelLower = dayLabel.toLowerCase()
  return blockLower === labelLower || blockLower.startsWith(labelLower) || labelLower.startsWith(blockLower)
}

export interface ProjectShadowPanelProps {
  fields: {
    user: Record<string, unknown>
    project: Record<string, unknown>
  } | null
  isLoading: boolean
  progress: number
}

export function ProjectShadowPanel({ fields, isLoading, progress }: ProjectShadowPanelProps) {
  const [phasesExpanded, setPhasesExpanded] = useState(false)
  const user = fields?.user ?? {}
  const project = fields?.project ?? {}

  return (
    <div className="h-full overflow-y-auto bg-[#FAF9F6] p-8">
      <header className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Harvey&apos;s Knowledge</h2>
        <p className="text-sm text-gray-500">Information extracted from our conversation</p>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-sm text-gray-600">
            <span>Completion</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-[#8B5CF6] transition-all duration-300"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>
        {isLoading && (
          <div className="mt-2 flex items-center gap-2 text-sm text-[#8B5CF6]">
            <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
            <span>Extracting...</span>
          </div>
        )}
      </header>

      {/* Section: Project Info */}
      <section className="mb-8">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Project Info</h3>
        <div className="border-b border-gray-200 pb-2 mb-4" />
        {project.title != null && project.title !== '' && (
          <div className="mb-3 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg">check_circle</span>
            <div>
              <div className="text-sm font-medium text-gray-700">Title</div>
              <div className="text-gray-900">{String(project.title)}</div>
            </div>
          </div>
        )}
        {project.description != null && project.description !== '' && (
          <div className="mb-3 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg">check_circle</span>
            <div>
              <div className="text-sm font-medium text-gray-700">Description</div>
              <div className="text-gray-900">{String(project.description)}</div>
            </div>
          </div>
        )}
        {project.goals != null && project.goals !== '' && (
          <div className="mb-3 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg">check_circle</span>
            <div>
              <div className="text-sm font-medium text-gray-700">Goals</div>
              <div className="text-gray-900">{String(project.goals)}</div>
            </div>
          </div>
        )}
        {project.project_type != null && project.project_type !== '' && (
          <div className="mb-3 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg">check_circle</span>
            <div>
              <div className="text-sm font-medium text-gray-700">Project type</div>
              <div className="text-gray-900">{String(project.project_type)}</div>
            </div>
          </div>
        )}
        {project.target_deadline != null && project.target_deadline !== '' && (
          <div className="mb-3 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg">check_circle</span>
            <div>
              <div className="text-sm font-medium text-gray-700">Target deadline</div>
              <div className="text-gray-900">{formatDate(String(project.target_deadline))}</div>
            </div>
          </div>
        )}
        {project.motivation != null && project.motivation !== '' && (
          <div className="mb-3 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg">check_circle</span>
            <div>
              <div className="text-sm font-medium text-gray-700">Motivation</div>
              <div className="text-gray-900">{String(project.motivation)}</div>
            </div>
          </div>
        )}
        {project.phases != null && typeof project.phases === 'object' && Object.keys(project.phases as object).length > 0 && (
          <div className="mb-3 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg">check_circle</span>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setPhasesExpanded(!phasesExpanded)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-purple-600"
              >
                {phasesExpanded ? '▼' : '▶'}
                Phases ({Object.keys(project.phases as object).length})
              </button>
              {phasesExpanded && (
                <div className="mt-2 space-y-2 pl-4 border-l-2 border-gray-200">
                  {Object.entries(project.phases as Record<string, { name?: string; description?: string }>).map(([key, phase]) => (
                    <div key={key} className="text-sm">
                      {phase?.name != null && <div className="font-medium text-gray-900">{phase.name}</div>}
                      {phase?.description != null && <div className="text-gray-600">{phase.description}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {project.projectNotes != null && project.projectNotes !== '' && (
          <div className="mb-3 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg">check_circle</span>
            <div>
              <div className="text-sm font-medium text-gray-700">Project notes</div>
              <div className="text-gray-900">{typeof project.projectNotes === 'object' ? JSON.stringify(project.projectNotes) : String(project.projectNotes)}</div>
            </div>
          </div>
        )}
      </section>

      {/* Section: Your Schedule */}
      <section className="mb-8">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Your Schedule</h3>
        <div className="border-b border-gray-200 pb-2 mb-4" />
        {user.workSchedule != null && typeof user.workSchedule === 'object' && (
          <div className="mb-4 animate-in fade-in duration-300">
            <div className="mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-green-600 text-lg">check_circle</span>
              <span className="text-sm font-medium text-gray-700">Work schedule</span>
            </div>
            <div className="grid grid-cols-7 gap-2 text-sm">
              {DAYS_SHORT.map((day) => {
                const ws = user.workSchedule as { days?: string[]; start_time?: string; end_time?: string }
                const days = Array.isArray(ws.days) ? ws.days : []
                const isWorkDay = days.some((d) => dayMatches(day, d))
                return (
                  <div key={day} className="rounded bg-gray-50 p-2 text-center">
                    <div className="font-medium text-gray-700">{day}</div>
                    <div className="text-gray-900">{isWorkDay ? `${formatTime(ws.start_time ?? '')}–${formatTime(ws.end_time ?? '')}` : '—'}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {user.commute != null && typeof user.commute === 'object' && (
          <div className="mb-4 animate-in fade-in duration-300">
            <div className="mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-green-600 text-lg">check_circle</span>
              <span className="text-sm font-medium text-gray-700">Commute</span>
            </div>
            <div className="space-y-1 text-sm text-gray-900">
              {(user.commute as { morning?: { duration?: number; start_time?: string } }).morning != null && (
                <div>Morning: {(user.commute as { morning: { duration: number } }).morning.duration} min</div>
              )}
              {(user.commute as { evening?: { duration?: number; start_time?: string } }).evening != null && (
                <div>Evening: {(user.commute as { evening: { duration: number } }).evening.duration} min</div>
              )}
            </div>
          </div>
        )}
        {user.availabilityWindows != null && Array.isArray(user.availabilityWindows) && (user.availabilityWindows as unknown[]).length > 0 && (
          <div className="mb-4 animate-in fade-in duration-300">
            <div className="mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-green-600 text-lg">check_circle</span>
              <span className="text-sm font-medium text-gray-700">Availability windows</span>
            </div>
            <div className="space-y-3">
              {(user.availabilityWindows as Array<{ days?: string[]; start_time?: string; end_time?: string; type?: string }>).map((block, idx) => (
                <div key={idx} className="rounded border border-gray-200 bg-green-50/50 p-2">
                  {block.type != null && block.type !== '' && (
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-green-700">{block.type}</div>
                  )}
                  <div className="grid grid-cols-7 gap-1 text-xs">
                    {DAYS_FULL.map((day) => {
                      const shortDay = day.substring(0, 3)
                      const days = Array.isArray(block.days) ? block.days : []
                      const isAvailable = days.some((d) => dayMatches(shortDay, d) || dayMatches(day, d))
                      return (
                        <div key={day} className="rounded bg-white/80 p-1 text-center">
                          <div className="font-medium text-gray-700">{shortDay}</div>
                          <div className="text-gray-900">{isAvailable ? `${formatTime(block.start_time ?? '')}–${formatTime(block.end_time ?? '')}` : '—'}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {project.weekly_hours_commitment != null && (
          <div className="mb-3 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg">check_circle</span>
            <div>
              <div className="text-sm font-medium text-gray-700">Weekly hours</div>
              <div className="text-gray-900">{Number(project.weekly_hours_commitment)} hours per week</div>
            </div>
          </div>
        )}
      </section>

      {/* Section: Preferences */}
      <section>
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Preferences</h3>
        <div className="border-b border-gray-200 pb-2 mb-4" />
        {user.timezone != null && user.timezone !== '' && (
          <div className="mb-3 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg">check_circle</span>
            <div>
              <div className="text-sm font-medium text-gray-700">Timezone</div>
              <div className="text-gray-900">{String(user.timezone)}</div>
            </div>
          </div>
        )}
        {user.preferred_session_length != null && (
          <div className="mb-3 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg">check_circle</span>
            <div>
              <div className="text-sm font-medium text-gray-700">Preferred session length</div>
              <div className="text-gray-900">
                {Number(user.preferred_session_length) >= 60
                  ? `${Math.round(Number(user.preferred_session_length) / 60)} hours`
                  : `${user.preferred_session_length} minutes`}
              </div>
            </div>
          </div>
        )}
        {user.communication_style != null && user.communication_style !== '' && (
          <div className="mb-3 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg">check_circle</span>
            <div>
              <div className="text-sm font-medium text-gray-700">Communication style</div>
              <div className="text-gray-900 capitalize">{String(user.communication_style)}</div>
            </div>
          </div>
        )}
        {project.skill_level != null && project.skill_level !== '' && (
          <div className="mb-3 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg">check_circle</span>
            <div>
              <div className="text-sm font-medium text-gray-700">Skill level</div>
              <div className="text-gray-900 capitalize">{String(project.skill_level)}</div>
            </div>
          </div>
        )}
        {project.tools_and_stack != null && Array.isArray(project.tools_and_stack) && (project.tools_and_stack as string[]).length > 0 && (
          <div className="mb-3 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg">check_circle</span>
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">Tools & stack</div>
              <div className="flex flex-wrap gap-1">
                {(project.tools_and_stack as string[]).map((tool) => (
                  <span key={tool} className="rounded-full bg-purple-100 px-2 py-0.5 text-sm text-purple-700">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
        {user.userNotes != null && user.userNotes !== '' && (
          <div className="mb-3 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg">check_circle</span>
            <div>
              <div className="text-sm font-medium text-gray-700">User notes</div>
              <div className="text-gray-900">{typeof user.userNotes === 'object' ? JSON.stringify(user.userNotes) : String(user.userNotes)}</div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
