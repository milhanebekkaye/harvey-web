'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { StickyUnsavedBar } from '@/components/ui/StickyUnsavedBar'
import { EditableField } from './EditableField'
import type { SelectOption } from './EditableField'

/** Phase entry (from Project.phases) */
export interface ProjectPhase {
  id?: number
  title?: string
  goal?: string | null
  deadline?: string | null
  status?: string // "completed" | "active" | "future"
}

/** Phases container (from Project.phases JSON) */
export interface ProjectPhasesData {
  phases?: ProjectPhase[]
  active_phase_id?: number
}

/** Note with timestamp (from Project.projectNotes) */
export interface ProjectNoteEntry {
  note: string
  extracted_at?: string
}

/** Milestone from schedule generation (Project.milestones JSON array) */
export interface ProjectMilestoneEntry {
  title: string
}

/** Project shape passed from server (dates as ISO strings) */
export interface SerializedProject {
  id: string
  userId: string
  title: string
  description: string | null
  goals: string | null
  status: string
  createdAt: string
  updatedAt: string
  target_deadline: string | null
  skill_level: string | null
  tools_and_stack: string[]
  project_type: string | null
  weekly_hours_commitment: number | null
  motivation: string | null
  phases?: ProjectPhasesData | null
  projectNotes?: ProjectNoteEntry[] | null
  /** From schedule generation; shown on Project Details when non-empty */
  milestones?: ProjectMilestoneEntry[] | null
  schedule_duration_days?: number | null
}

interface ProjectDetailsFormProps {
  initialProject: SerializedProject
}

const SKILL_LEVEL_OPTIONS: SelectOption[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

function formatUpdatedAt(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; dot: string }> = {
    active: { label: 'Active', dot: 'bg-emerald-500' },
    paused: { label: 'Paused', dot: 'bg-amber-500' },
    completed: { label: 'Completed', dot: 'bg-blue-500' },
  }
  const { label, dot } = config[status] ?? { label: status, dot: 'bg-slate-400' }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700">
      <span className={`size-2 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

function formatPhaseDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

function formatNoteDate(iso: string | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    }
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })
  } catch {
    return ''
  }
}

function isEqual(a: SerializedProject, b: SerializedProject): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.goals === b.goals &&
    a.status === b.status &&
    (a.target_deadline ?? null) === (b.target_deadline ?? null) &&
    (a.skill_level ?? null) === (b.skill_level ?? null) &&
    (a.project_type ?? null) === (b.project_type ?? null) &&
    (a.weekly_hours_commitment ?? null) === (b.weekly_hours_commitment ?? null) &&
    (a.motivation ?? null) === (b.motivation ?? null) &&
    JSON.stringify(a.tools_and_stack ?? []) === JSON.stringify(b.tools_and_stack ?? []) &&
    JSON.stringify(a.phases ?? null) === JSON.stringify(b.phases ?? null) &&
    JSON.stringify(a.projectNotes ?? null) === JSON.stringify(b.projectNotes ?? null)
  )
}

/**
 * Project Details form: two cards (Project Info, Your Context), editable fields, save flow.
 * Receives initial project from server; tracks dirty state and PATCH on save.
 */
export function ProjectDetailsForm({ initialProject }: ProjectDetailsFormProps) {
  const [project, setProject] = useState(initialProject)
  const [lastSaved, setLastSaved] = useState(initialProject)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(initialProject.title)

  const hasChanges = !isEqual(project, lastSaved)
  const router = useRouter()

  useEffect(() => {
    setTitleValue(project.title)
  }, [project.title])

  useEffect(() => {
    if (!hasChanges) return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasChanges])

  const handleNavigate = useCallback(
    (href: string) => {
      if (hasChanges && !window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        return
      }
      router.push(href)
    },
    [hasChanges, router]
  )

  const updateProject = useCallback((updates: Partial<SerializedProject>) => {
    setProject((prev) => ({ ...prev, ...updates }))
  }, [])

  const handleSave = async () => {
    if (!hasChanges || saving) return
    setSaving(true)
    setToast(null)
    try {
      const weeklyHours =
        project.weekly_hours_commitment != null &&
        project.weekly_hours_commitment >= 1 &&
        project.weekly_hours_commitment <= 168
          ? project.weekly_hours_commitment
          : null
      const body: Record<string, unknown> = {
        title: project.title,
        description: project.description ?? null,
        goals: project.goals ?? null,
        status: project.status,
        target_deadline: project.target_deadline ?? null,
        skill_level: project.skill_level ?? null,
        tools_and_stack: project.tools_and_stack ?? [],
        project_type: project.project_type ?? null,
        weekly_hours_commitment: weeklyHours,
        motivation: project.motivation ?? null,
        phases: project.phases ?? null,
        projectNotes: project.projectNotes ?? null,
      }
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Failed to save')
      }
      const updated = await res.json()
      const next = {
        ...project,
        ...updated,
        target_deadline: updated.target_deadline ?? null,
        updatedAt: updated.updatedAt,
      }
      setProject(next)
      setLastSaved(next)
      setToast('Changes saved')
      setTimeout(() => setToast(null), 3000)
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Failed to save')
      setTimeout(() => setToast(null), 4000)
    } finally {
      setSaving(false)
    }
  }

  const handleDiscard = () => {
    setProject(lastSaved)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 pb-24">
      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium bg-slate-800 text-white"
          role="status"
        >
          {toast}
        </div>
      )}

      {/* Top: Back to Dashboard */}
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => handleNavigate('/dashboard')}
          className="text-sm text-[#62499c] hover:text-[#895af6] font-medium inline-flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Back to Dashboard
        </button>
      </div>

      {/* Header: title (editable on click), status, actions, timestamp */}
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <input
                type="text"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={() => {
                  const v = titleValue.trim() || 'Untitled Project'
                  setTitleValue(v)
                  updateProject({ title: v })
                  setEditingTitle(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = titleValue.trim() || 'Untitled Project'
                    setTitleValue(v)
                    updateProject({ title: v })
                    setEditingTitle(false)
                  }
                }}
                autoFocus
                className="w-full text-2xl font-bold text-slate-800 bg-transparent border-b-2 border-[#895af6] focus:outline-none py-1"
              />
            ) : (
              <h1
                role="button"
                tabIndex={0}
                onClick={() => {
                  setTitleValue(project.title || '')
                  setEditingTitle(true)
                }}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setEditingTitle(true)}
                className="text-2xl font-bold text-slate-800 cursor-pointer hover:bg-[#895af6]/5 rounded px-1 -mx-1"
              >
                {project.title || 'Untitled Project'}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={project.status} />
          </div>
        </div>
        <p className="text-sm text-slate-500 italic mt-2">
          Last updated by Harvey • {formatUpdatedAt(project.updatedAt)}
        </p>
      </div>

      {/* Two column grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 hover:shadow-md transition-shadow">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-500">folder</span>
            Project Info
          </h2>
          <div className="space-y-4">
            <EditableField
              label="Description"
              value={project.description}
              type="textarea"
              placeholder="Add description..."
              maxLength={500}
              onChange={(v) => updateProject({ description: v as string | null })}
            />
            <EditableField
              label="Goals"
              value={project.goals}
              type="textarea"
              placeholder="Add goals..."
              maxLength={500}
              onChange={(v) => updateProject({ goals: v as string | null })}
            />
            <EditableField
              label="Target Deadline"
              value={project.target_deadline}
              type="date"
              placeholder="Add target deadline..."
              nullable
              onChange={(v) => updateProject({ target_deadline: v as string | null })}
            />
            <EditableField
              label="Project Type"
              value={project.project_type}
              type="text"
              placeholder="e.g. web app, mobile app, SaaS, browser extension..."
              nullable
              onChange={(v) => updateProject({ project_type: v as string | null })}
            />
          </div>
        </section>
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 hover:shadow-md transition-shadow">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-500">person</span>
            Your Context
          </h2>
          <div className="space-y-4">
            <EditableField
              label="Skill Level"
              value={project.skill_level}
              type="select"
              placeholder="Add skill level..."
              options={SKILL_LEVEL_OPTIONS}
              nullable
              onChange={(v) => updateProject({ skill_level: v as string | null })}
            />
            <EditableField
              label="Tools & Stack"
              value={project.tools_and_stack}
              type="tags"
              placeholder="Add tools and technologies..."
              maxTags={10}
              onChange={(v) => updateProject({ tools_and_stack: (v as string[]) ?? [] })}
            />
            <EditableField
              label="Weekly Hours"
              value={project.weekly_hours_commitment ?? null}
              type="number"
              placeholder="Add weekly hours (1–168)..."
              min={1}
              max={168}
              step={1}
              onChange={(v) =>
                updateProject({
                  weekly_hours_commitment: v != null && v !== '' ? (v as number) : null,
                })
              }
            />
            <EditableField
              label="Motivation"
              value={project.motivation}
              type="textarea"
              placeholder="Add motivation..."
              maxLength={300}
              onChange={(v) => updateProject({ motivation: v as string | null })}
            />
          </div>
        </section>
      </div>

      {/* Phases & Milestones — editable, saved with Save Changes */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 mb-6 hover:shadow-md transition-shadow">
        <h2 className="text-lg font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-500">flag</span>
          Phases & Milestones
        </h2>
        <p className="text-slate-500 text-sm mb-5">
          Key stages of your project. Edit below; save with the button at the bottom of the page.
        </p>
        {(project.phases?.phases?.length ?? 0) > 0 ? (
          <div className="space-y-0">
            {(project.phases!.phases as ProjectPhase[]).map((phase, index) => {
              const isActive = project.phases?.active_phase_id === phase.id || phase.status === 'active'
              const status = phase.status ?? 'future'
              const statusConfig: Record<string, { label: string; class: string }> = {
                completed: { label: 'Completed', class: 'bg-emerald-100 text-emerald-800' },
                active: { label: 'Active', class: 'bg-[#895af6]/15 text-[#62499c]' },
                future: { label: 'Upcoming', class: 'bg-slate-100 text-slate-600' },
              }
              const { class: statusClass } = statusConfig[status] ?? statusConfig.future
              const updatePhase = (updates: Partial<ProjectPhase>) => {
                const phases = [...(project.phases?.phases ?? [])] as ProjectPhase[]
                phases[index] = { ...phase, ...updates }
                updateProject({
                  phases: {
                    ...project.phases,
                    phases,
                    active_phase_id: project.phases?.active_phase_id,
                  },
                })
              }
              const removePhase = () => {
                const phases = (project.phases?.phases ?? []).filter((_, i) => i !== index) as ProjectPhase[]
                const nextActive =
                  project.phases?.active_phase_id === phase.id
                    ? undefined
                    : project.phases?.active_phase_id
                updateProject({
                  phases: phases.length ? { phases, active_phase_id: nextActive } : null,
                })
              }
              return (
                <div
                  key={phase.id ?? index}
                  className={`flex gap-4 py-4 ${index > 0 ? 'border-t border-slate-100' : ''} ${isActive ? 'rounded-lg bg-[#895af6]/5 -mx-2 px-2' : ''}`}
                >
                  <div className="flex flex-col items-center shrink-0">
                    <div className={`size-9 rounded-full flex items-center justify-center text-sm font-semibold ${isActive ? 'bg-[#895af6] text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {index + 1}
                    </div>
                    {index < (project.phases?.phases?.length ?? 0) - 1 && (
                      <div className="w-0.5 flex-1 min-h-[8px] bg-slate-200 my-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={phase.title ?? ''}
                        onChange={(e) => updatePhase({ title: e.target.value })}
                        placeholder="Phase title"
                        className="flex-1 min-w-[120px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium text-slate-800 focus:border-[#895af6] focus:outline-none focus:ring-1 focus:ring-[#895af6]"
                      />
                      <select
                        value={phase.status ?? 'future'}
                        onChange={(e) => updatePhase({ status: e.target.value })}
                        className={`rounded-full px-2 py-1 text-xs font-medium border-0 ${statusClass}`}
                      >
                        <option value="future">Upcoming</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                      </select>
                      <button
                        type="button"
                        onClick={removePhase}
                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                        title="Remove phase"
                      >
                        <span className="material-symbols-outlined text-lg">close</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={phase.goal ?? ''}
                      onChange={(e) => updatePhase({ goal: e.target.value || null })}
                      placeholder="Goal (optional)"
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-600 focus:border-[#895af6] focus:outline-none focus:ring-1 focus:ring-[#895af6]"
                    />
                    <input
                      type="date"
                      value={phase.deadline ? String(phase.deadline).slice(0, 10) : ''}
                      onChange={(e) => updatePhase({ deadline: e.target.value || null })}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-500 focus:border-[#895af6] focus:outline-none"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => {
            const phases = [...(project.phases?.phases ?? [])] as ProjectPhase[]
            const nextId = Math.max(0, ...phases.map((p) => p.id ?? 0)) + 1
            phases.push({
              id: nextId,
              title: '',
              goal: null,
              deadline: null,
              status: 'future',
            })
            updateProject({
              phases: {
                phases,
                active_phase_id: project.phases?.active_phase_id ?? nextId,
              },
            })
          }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Add phase
        </button>
        {!(project.phases?.phases?.length ?? 0) && (
          <p className="text-xs text-slate-400 mt-2">Click &quot;Add phase&quot; to create your first phase.</p>
        )}
      </section>

      {/* Schedule milestones (from schedule generation; read-only) */}
      {(() => {
        const raw = project.milestones
        const items: string[] = []
        if (Array.isArray(raw) && raw.length > 0) {
          for (const entry of raw) {
            if (entry && typeof entry === 'object' && 'title' in entry && typeof (entry as { title: unknown }).title === 'string') {
              items.push((entry as { title: string }).title)
            }
          }
        } else if (typeof raw === 'string' && (raw as string).trim()) {
          items.push(...(raw as string).trim().split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean))
        }
        if (items.length === 0) return null
        return (
          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 mb-6 hover:shadow-md transition-shadow">
            <h2 className="text-lg font-semibold text-slate-800 mb-1 flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-500">track_changes</span>
              Milestones
            </h2>
            <p className="text-slate-500 text-sm mb-4">
              By the end of this schedule, you should have:
            </p>
            <ul className="space-y-2">
              {items.map((title, i) => (
                <li
                  key={i}
                  className="flex gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-sm text-slate-700"
                >
                  <span className="text-[#895af6] font-medium shrink-0">{i + 1}.</span>
                  <span>{title}</span>
                </li>
              ))}
            </ul>
          </section>
        )
      })()}

      {/* Harvey's Notes — editable, saved with Save Changes */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 mb-8 hover:shadow-md transition-shadow">
        <h2 className="text-lg font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-500">lightbulb</span>
          Harvey&apos;s Notes
        </h2>
        <p className="text-slate-500 text-sm mb-5">
          Observations about your project. Add or edit notes below, then click &quot;Save Changes&quot; at the bottom to store them.
        </p>
        {(project.projectNotes?.length ?? 0) > 0 ? (
          <ul className="space-y-4">
            {[...(project.projectNotes ?? [])].reverse().map((entry, displayIndex) => {
              const realIndex = (project.projectNotes!.length - 1) - displayIndex
              const updateNote = (note: string) => {
                const notes = [...(project.projectNotes ?? [])]
                notes[realIndex] = { ...entry, note }
                updateProject({ projectNotes: notes })
              }
              const removeNote = () => {
                const notes = (project.projectNotes ?? []).filter((_, i) => i !== realIndex)
                updateProject({ projectNotes: notes.length ? notes : null })
              }
              return (
                <li
                  key={realIndex}
                  className="flex gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-left"
                >
                  <span className="material-symbols-outlined text-[#895af6]/70 shrink-0 mt-1 text-xl">
                    format_quote
                  </span>
                  <div className="min-w-0 flex-1">
                    <textarea
                      value={entry.note}
                      onChange={(e) => updateNote(e.target.value)}
                      placeholder="Add or edit this note..."
                      rows={5}
                      className="w-full min-h-[120px] resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-700 placeholder:text-slate-400 focus:border-[#895af6] focus:outline-none focus:ring-2 focus:ring-[#895af6]/20"
                    />
                    {entry.extracted_at && (
                      <p className="text-xs text-slate-400 mt-2">
                        {formatNoteDate(entry.extracted_at)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={removeNote}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0 transition-colors"
                    title="Remove note"
                  >
                    <span className="material-symbols-outlined text-xl">close</span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
        <button
          type="button"
          onClick={() => {
            const notes = [...(project.projectNotes ?? [])]
            notes.push({ note: '', extracted_at: new Date().toISOString() })
            updateProject({ projectNotes: notes })
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-base font-medium text-slate-600 hover:border-[#895af6]/50 hover:bg-[#895af6]/5 hover:text-[#895af6] transition-colors"
        >
          <span className="material-symbols-outlined text-xl">add</span>
          Add note
        </button>
        {!(project.projectNotes?.length ?? 0) && (
          <p className="text-sm text-slate-400 mt-3">Click &quot;Add note&quot; to create one, or let Harvey add observations as you chat. Remember to click &quot;Save Changes&quot; to save.</p>
        )}
      </section>

      {/* User Settings — same section style as "Project" on Settings page */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">User Settings</h2>
        <p className="text-slate-500 text-sm mb-4">
          Manage your work schedule, availability, and preferences.
        </p>
        <button
          type="button"
          onClick={() => handleNavigate('/dashboard/settings')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
        >
          View User Settings
        </button>
      </section>

      <StickyUnsavedBar
        hasChanges={hasChanges}
        saving={saving}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </div>
  )
}