'use client'

import {
  ArrowLeft,
  BarChart3,
  Calendar,
  Check,
  Clock,
  Folder,
  Pencil,
  Plus,
  Wrench,
  X,
} from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MarkdownMessage } from '@/components/ui/MarkdownMessage'
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

function formatCreatedAt(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hr ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
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

const STATUS_CONFIG: Record<string, { label: string; dot: string; pillClass: string }> = {
  active: { label: 'Active', dot: 'bg-emerald-500', pillClass: 'bg-emerald-500/15 text-emerald-700' },
  paused: { label: 'Paused', dot: 'bg-amber-500', pillClass: 'bg-amber-500/15 text-amber-700' },
  completed: { label: 'Completed', dot: 'bg-blue-500', pillClass: 'bg-blue-500/15 text-blue-700' },
}

const PHASE_STATUS_CONFIG: Record<string, { label: string; barClass: string; textClass: string }> = {
  completed: { label: 'Done', barClass: 'bg-gradient-to-r from-emerald-400 to-emerald-600', textClass: 'text-emerald-700' },
  active: { label: 'Current', barClass: 'bg-gradient-to-r from-violet-500 to-violet-600', textClass: 'text-violet-700' },
  future: { label: 'Upcoming', barClass: 'bg-slate-200', textClass: 'text-slate-400' },
}

/** SVG progress ring: percent 0-100, size 56 (w-14 h-14) */
function ProgressRing({ percent }: { percent: number }) {
  const size = 56
  const stroke = 4
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference - (percent / 100) * circumference
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(0,0,0,0.06)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#progressGradient)"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300"
      />
      <defs>
        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/**
 * Project Details form: new layout (sticky bar, hero, phase stepper + tabs, tab content).
 * All state, save logic, and API calls preserved from original.
 */
export function ProjectDetailsForm({ initialProject }: ProjectDetailsFormProps) {
  const [project, setProject] = useState(initialProject)
  const [lastSaved, setLastSaved] = useState(initialProject)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(initialProject.title)
  const [activeTab, setActiveTab] = useState<'overview' | 'phases' | 'notes'>('overview')
  const [hoveredPhase, setHoveredPhase] = useState<number | null>(null)
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set())

  const hasChanges = !isEqual(project, lastSaved)
  const router = useRouter()

  const completedCount = project.phases?.phases?.filter((p) => p.status === 'completed').length ?? 0
  const totalPhases = project.phases?.phases?.length ?? 0
  const progressPercent = totalPhases > 0 ? Math.round((completedCount / totalPhases) * 100) : 0

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

  const toggleNoteExpanded = (index: number) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const phases = (project.phases?.phases ?? []) as ProjectPhase[]
  const notesCount = project.projectNotes?.length ?? 0

  return (
    <>
      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium bg-slate-800 text-white"
          role="status"
        >
          {toast}
        </div>
      )}

      {/* 1. Sticky top bar */}
      <header className="sticky top-0 z-20 backdrop-blur-[20px] bg-[rgba(250,250,248,0.72)] border-b border-black/[0.06]">
        <div className="max-w-6xl mx-auto px-10 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => handleNavigate('/dashboard')}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-5 h-5" />
            Dashboard
          </button>
          <div className="flex items-center gap-3">
            {!hasChanges ? (
              <span className="text-xs text-slate-300">All changes saved</span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={saving}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 rounded-full text-sm font-medium text-white bg-gradient-to-r from-[#895af6] to-[#7849d9] hover:opacity-95 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-10 pt-14 pb-24">
        {/* 2. Hero */}
        <section className="flex gap-12 pb-10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${
                  STATUS_CONFIG[project.status]?.pillClass ?? 'bg-slate-100 text-slate-600'
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${STATUS_CONFIG[project.status]?.dot ?? 'bg-slate-400'} shadow-[0_0_6px_currentColor]`}
                />
                {STATUS_CONFIG[project.status]?.label ?? project.status}
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-400">Last updated {formatRelativeTime(project.updatedAt)}</span>
            </div>
            <div className="mt-4">
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
                  className="w-full text-4xl font-bold text-slate-900 tracking-tight bg-transparent border-b-2 border-violet-500/30 focus:outline-none py-1"
                />
              ) : (
                <div className="group flex items-center gap-2">
                  <h1
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setTitleValue(project.title || '')
                      setEditingTitle(true)
                    }}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setEditingTitle(true)}
                    className="text-4xl font-bold text-slate-900 tracking-tight cursor-pointer hover:opacity-80"
                  >
                    {project.title || 'Untitled Project'}
                  </h1>
                  <Pencil className="w-5 h-5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>
            <div className="mt-3 [&_.block.text-sm]:hidden [&_.break-words]:text-slate-400 [&_.break-words]:text-base [&_.break-words]:leading-relaxed">
              <EditableField
                label="Description"
                value={project.description}
                type="textarea"
                placeholder="Add description..."
                maxLength={500}
                onChange={(v) => updateProject({ description: v as string | null })}
              />
            </div>
            <span className="text-xs text-slate-300 mt-5 block">Created {formatCreatedAt(project.createdAt)}</span>
          </div>

          <div className="w-80 flex-shrink-0">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-4 pb-5 border-b border-slate-100">
                <ProgressRing percent={progressPercent} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Progress</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {completedCount} of {totalPhases} phases
                  </p>
                </div>
              </div>
              <div className="space-y-5 pt-5">
                <div className="group flex items-start gap-3 [&_.block.text-sm]:hidden">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(137,91,245,0.06)] flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5 text-[#895bf5]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Deadline</p>
                    <EditableField
                      label="Deadline"
                      value={project.target_deadline}
                      type="date"
                      placeholder="Not set"
                      nullable
                      onChange={(v) => updateProject({ target_deadline: v as string | null })}
                    />
                  </div>
                </div>
                <div className="group flex items-start gap-3 [&_.block.text-sm]:hidden">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(137,91,245,0.06)] flex items-center justify-center shrink-0">
                    <BarChart3 className="w-5 h-5 text-[#895bf5]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Skill level</p>
                    <EditableField
                      label="Skill level"
                      value={project.skill_level}
                      type="select"
                      placeholder="Not set"
                      options={SKILL_LEVEL_OPTIONS}
                      nullable
                      onChange={(v) => updateProject({ skill_level: v as string | null })}
                    />
                  </div>
                </div>
                <div className="group flex items-start gap-3 [&_.block.text-sm]:hidden">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(137,91,245,0.06)] flex items-center justify-center shrink-0">
                    <Wrench className="w-5 h-5 text-[#895bf5]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Stack</p>
                    <EditableField
                      label="Stack"
                      value={project.tools_and_stack}
                      type="tags"
                      placeholder="Add tools..."
                      maxTags={10}
                      onChange={(v) => updateProject({ tools_and_stack: (v as string[]) ?? [] })}
                    />
                  </div>
                </div>
                <div className="group flex items-start gap-3 [&_.block.text-sm]:hidden">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(137,91,245,0.06)] flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-[#895bf5]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Commitment</p>
                    <EditableField
                      label="Weekly hours"
                      value={project.weekly_hours_commitment ?? null}
                      type="number"
                      placeholder="Not set"
                      min={1}
                      max={168}
                      step={1}
                      showNumberStepper={false}
                      suffix={project.weekly_hours_commitment != null ? <span className="text-sm font-semibold text-slate-800">hrs/week</span> : undefined}
                      onChange={(v) =>
                        updateProject({
                          weekly_hours_commitment: v != null && v !== '' ? (v as number) : null,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="group flex items-start gap-3 [&_.block.text-sm]:hidden">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(137,91,245,0.06)] flex items-center justify-center shrink-0">
                    <Folder className="w-5 h-5 text-[#895bf5]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Type</p>
                    <EditableField
                      label="Type"
                      value={project.project_type}
                      type="text"
                      placeholder="e.g. web app, SaaS..."
                      nullable
                      onChange={(v) => updateProject({ project_type: v as string | null })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Phase stepper + tabs card */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          {/* Phase stepper */}
          {phases.length > 0 && (
            <div className="flex gap-0 mb-6">
              {phases.map((phase, index) => {
                const status = phase.status ?? 'future'
                const config = PHASE_STATUS_CONFIG[status] ?? PHASE_STATUS_CONFIG.future
                const isActive = status === 'active'
                return (
                  <div
                    key={phase.id ?? index}
                    className="flex-1 flex flex-col items-center relative"
                    onMouseEnter={() => setHoveredPhase(index)}
                    onMouseLeave={() => setHoveredPhase(null)}
                  >
                    <div
                      className={`w-full h-1.5 rounded-full transition-transform origin-center hover:scale-y-150 ${config.barClass}`}
                    />
                    <p className={`text-xs mt-2 font-medium truncate w-full text-center ${config.textClass}`}>
                      {phase.title || `Phase ${index + 1}`}
                    </p>
                    {isActive && (
                      <p className="text-[10px] uppercase tracking-wider text-violet-600 font-semibold">Current</p>
                    )}
                    {hoveredPhase === index && (
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-10 px-3 py-2 rounded-lg bg-slate-800 text-white text-xs shadow-lg min-w-[160px]">
                        <p className="font-semibold">{phase.title || `Phase ${index + 1}`}</p>
                        {phase.goal && <p className="mt-1 text-slate-300">{phase.goal}</p>}
                        {phase.deadline && (
                          <p className="mt-1 text-slate-400">{formatPhaseDate(phase.deadline)}</p>
                        )}
                        <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-600 text-slate-200">
                          {config.label}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="border-t border-slate-100 pt-4">
            <div className="flex gap-8">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                  activeTab === 'overview'
                    ? 'text-slate-900 border-violet-500'
                    : 'text-slate-400 border-transparent hover:text-slate-600'
                }`}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('phases')}
                className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                  activeTab === 'phases'
                    ? 'text-slate-900 border-violet-500'
                    : 'text-slate-400 border-transparent hover:text-slate-600'
                }`}
              >
                Phases
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('notes')}
                className={`text-sm font-medium pb-2 border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'notes'
                    ? 'text-slate-900 border-violet-500'
                    : 'text-slate-400 border-transparent hover:text-slate-600'
                }`}
              >
                Harvey&apos;s Notes
                {notesCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold">
                    {notesCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* 4. Tab content */}
        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-12 gap-x-6 gap-y-0">
              {/* Goals */}
              <div className="col-span-3 pt-4 pb-4 border-b border-black/[0.04]">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Goals</p>
              </div>
              <div className="col-span-8 pt-4 pb-4 border-b border-black/[0.04] [&_.block.text-sm]:hidden">
                <EditableField
                  label="Goals"
                  value={project.goals}
                  type="textarea"
                  placeholder="Add goals..."
                  maxLength={500}
                  onChange={(v) => updateProject({ goals: v as string | null })}
                />
              </div>
              <div className="col-span-1 pt-4 pb-4 border-b border-black/[0.04]" />

              {/* Motivation */}
              <div className="col-span-3 py-4 border-b border-black/[0.04]">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Motivation</p>
              </div>
              <div className="col-span-8 py-4 border-b border-black/[0.04] pl-4 border-l-2 border-violet-500/15 [&_.block.text-sm]:hidden">
                <EditableField
                  label="Motivation"
                  value={project.motivation}
                  type="textarea"
                  placeholder="Add motivation..."
                  maxLength={300}
                  onChange={(v) => updateProject({ motivation: v as string | null })}
                />
              </div>
              <div className="col-span-1 py-4 border-b border-black/[0.04]" />

              {/* Stack */}
              <div className="col-span-3 py-4 border-b border-black/[0.04]">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Stack</p>
              </div>
              <div className="col-span-8 py-4 border-b border-black/[0.04] [&_.block.text-sm]:hidden">
                <EditableField
                  label="Stack"
                  value={project.tools_and_stack}
                  type="tags"
                  placeholder="Add tools..."
                  maxTags={10}
                  onChange={(v) => updateProject({ tools_and_stack: (v as string[]) ?? [] })}
                />
                <button
                  type="button"
                  onClick={() => {}}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
              <div className="col-span-1 py-4 border-b border-black/[0.04]" />

              {/* Details */}
              <div className="col-span-3 py-4 border-b border-black/[0.04]">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Details</p>
              </div>
              <div className="col-span-8 py-4 border-b border-black/[0.04]">
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-slate-400">Type</p>
                    <p className="text-sm font-semibold text-slate-800">{project.project_type ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Deadline</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {project.target_deadline
                        ? new Date(project.target_deadline).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Weekly hours</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {project.weekly_hours_commitment != null ? `${project.weekly_hours_commitment} hrs` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Skill level</p>
                    <p className="text-sm font-semibold text-slate-800 capitalize">
                      {project.skill_level ?? '—'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="col-span-1 py-4 border-b border-black/[0.04]" />

              {/* Milestones (read-only, when present) */}
              {(() => {
                const raw = project.milestones
                const items: string[] = []
                if (Array.isArray(raw) && raw.length > 0) {
                  for (const entry of raw) {
                    if (entry && typeof entry === 'object' && 'title' in entry && typeof (entry as { title: unknown }).title === 'string') {
                      items.push((entry as { title: string }).title)
                    }
                  }
                }
                if (items.length === 0) return null
                return (
                  <>
                    <div className="col-span-3 py-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Milestones</p>
                    </div>
                    <div className="col-span-8 py-4">
                      <ul className="space-y-2">
                        {items.map((title, i) => (
                          <li key={i} className="flex gap-2 text-sm text-slate-700">
                            <span className="text-[#895af6] font-medium shrink-0">{i + 1}.</span>
                            <div className="min-w-0 flex-1">
                              <MarkdownMessage content={title} className="text-sm text-slate-700 [&_p]:my-0" />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="col-span-1 py-4" />
                  </>
                )
              })()}
            </div>
          )}

          {activeTab === 'phases' && (
            <div className="space-y-0">
              {phases.length > 0 ? (
                phases.map((phase, index) => {
                  const status = phase.status ?? 'future'
                  const config = PHASE_STATUS_CONFIG[status] ?? PHASE_STATUS_CONFIG.future
                  const isCompleted = status === 'completed'
                  const isActive = status === 'active'
                  const updatePhase = (updates: Partial<ProjectPhase>) => {
                    const nextPhases = [...phases]
                    nextPhases[index] = { ...phase, ...updates }
                    updateProject({
                      phases: {
                        ...project.phases,
                        phases: nextPhases,
                        active_phase_id: project.phases?.active_phase_id,
                      },
                    })
                  }
                  const removePhase = () => {
                    const nextPhases = phases.filter((_, i) => i !== index)
                    const nextActive =
                      project.phases?.active_phase_id === phase.id ? undefined : project.phases?.active_phase_id
                    updateProject({
                      phases: nextPhases.length ? { phases: nextPhases, active_phase_id: nextActive } : null,
                    })
                  }
                  return (
                    <div
                      key={phase.id ?? index}
                      className={`flex gap-4 py-5 ${index > 0 ? 'border-t border-slate-100' : ''} ${isActive ? 'bg-violet-500/5 -mx-2 px-2 rounded-lg' : ''}`}
                    >
                      <div className="flex flex-col items-center shrink-0">
                        {isCompleted ? (
                          <div className="size-9 rounded-full bg-emerald-500 flex items-center justify-center">
                            <Check className="w-5 h-5 text-white" />
                          </div>
                        ) : isActive ? (
                          <div className="size-9 rounded-full bg-violet-500 flex items-center justify-center shadow-[0_0_12px_rgba(139,92,246,0.5)]" />
                        ) : (
                          <div className="size-9 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-500">
                            {index + 1}
                          </div>
                        )}
                        {index < phases.length - 1 && (
                          <div className="w-0.5 flex-1 min-h-[12px] bg-slate-200 my-1" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={phase.title ?? ''}
                            onChange={(e) => updatePhase({ title: e.target.value })}
                            placeholder="Phase title"
                            className={`flex-1 min-w-[120px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium focus:border-[#895af6] focus:outline-none focus:ring-1 focus:ring-[#895af6] ${status === 'future' ? 'text-slate-400 bg-slate-50/50' : 'text-slate-800'}`}
                          />
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                              isCompleted ? 'bg-emerald-100 text-emerald-800' : isActive ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {isCompleted ? 'Done' : isActive ? 'In Progress' : 'Upcoming'}
                          </span>
                          <button
                            type="button"
                            onClick={removePhase}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Remove phase"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={phase.goal ?? ''}
                          onChange={(e) => updatePhase({ goal: e.target.value || null })}
                          placeholder="Goal (optional)"
                          className={`w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-[#895af6] focus:outline-none focus:ring-1 focus:ring-[#895af6] ${status === 'future' ? 'text-slate-300' : 'text-slate-600'}`}
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
                })
              ) : null}
              <button
                type="button"
                onClick={() => {
                  const nextPhases = [...phases]
                  const nextId = Math.max(0, ...phases.map((p) => p.id ?? 0)) + 1
                  nextPhases.push({
                    id: nextId,
                    title: '',
                    goal: null,
                    deadline: null,
                    status: 'future',
                  })
                  updateProject({
                    phases: {
                      phases: nextPhases,
                      active_phase_id: project.phases?.active_phase_id ?? nextId,
                    },
                  })
                }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <Plus className="w-5 h-5" />
                Add Phase
              </button>
            </div>
          )}

          {activeTab === 'notes' && (
            <div>
              <div className="rounded-xl bg-violet-500/10 border border-violet-200/50 px-4 py-3 mb-6 flex items-start gap-3">
                <span className="text-lg" aria-hidden>🧠</span>
                <p className="text-sm text-slate-700">
                  These are notes Harvey has extracted from your conversations to better understand your project.
                </p>
              </div>
              <ul className="space-y-4">
                {[...(project.projectNotes ?? [])].reverse().map((entry, displayIndex) => {
                  const realIndex = (project.projectNotes!.length - 1) - displayIndex
                  const isExpanded = expandedNotes.has(realIndex)
                  const isLong = entry.note.length > 200
                  const showTruncated = isLong && !isExpanded
                  const hasCritical = /CRITICAL/i.test(entry.note)
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
                    <li key={realIndex} className="flex gap-4">
                      <div className="w-20 shrink-0 text-xs text-slate-400 pt-2">
                        {entry.extracted_at ? formatNoteDate(entry.extracted_at) : '—'}
                      </div>
                      <div className="min-w-0 flex-1">
                        {hasCritical && (
                          <span className="inline-block mb-2 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                            Key insight
                          </span>
                        )}
                        <div className="group flex items-start gap-2">
                          <textarea
                            value={entry.note}
                            onChange={(e) => updateNote(e.target.value)}
                            placeholder="Add or edit this note..."
                            rows={showTruncated ? 3 : 5}
                            className="w-full min-h-[80px] resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#895af6] focus:outline-none focus:ring-2 focus:ring-[#895af6]/20"
                          />
                          <button
                            type="button"
                            onClick={removeNote}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove note"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        {isLong && (
                          <button
                            type="button"
                            onClick={() => toggleNoteExpanded(realIndex)}
                            className="mt-2 text-xs font-medium text-violet-600 hover:text-violet-700"
                          >
                            {isExpanded ? 'Show less' : 'Read more'}
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                onClick={() => {
                  const notes = [...(project.projectNotes ?? [])]
                  notes.push({ note: '', extracted_at: new Date().toISOString() })
                  updateProject({ projectNotes: notes })
                }}
                className="mt-6 inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:border-violet-500/50 hover:bg-violet-500/5 hover:text-violet-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Add Note
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
