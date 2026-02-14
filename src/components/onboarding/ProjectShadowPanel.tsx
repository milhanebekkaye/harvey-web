/**
 * ProjectShadowPanel – Feature D (Shadow Panel) Step 5 + 7
 *
 * Live-updating panel that displays extracted user/project fields as Harvey
 * extracts them during onboarding. Step 7: inline edit with Save/Cancel per field.
 */

'use client'

import { useState, useCallback, useEffect } from 'react'

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

function getDayName(short: string): string {
  const map: Record<string, string> = {
    Mon: 'Monday',
    Tue: 'Tuesday',
    Wed: 'Wednesday',
    Thu: 'Thursday',
    Fri: 'Friday',
    Sat: 'Saturday',
    Sun: 'Sunday',
  }
  return map[short] ?? short
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
  projectId?: string | null
  onFieldUpdate?: (scope: 'user' | 'project', field: string, value: unknown) => void
}

export function ProjectShadowPanel({
  fields,
  isLoading,
  progress,
  projectId = null,
  onFieldUpdate,
}: ProjectShadowPanelProps) {
  const [phasesExpanded, setPhasesExpanded] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  const user = fields?.user ?? {}
  const project = fields?.project ?? {}

  const startEditing = useCallback((fieldKey: string, currentValue: unknown) => {
    console.log('[ShadowPanel] Start editing:', fieldKey, currentValue)
    setEditingField(fieldKey)
    setEditValue(currentValue !== undefined && currentValue !== null ? currentValue : '')
  }, [])

  const cancelEditing = useCallback(() => {
    console.log('[ShadowPanel] Cancel editing')
    setEditingField(null)
    setEditValue(null)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editingField) cancelEditing()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editingField, cancelEditing])

  const saveField = useCallback(
    async (fieldKey: string, scope: 'user' | 'project') => {
      console.log('[ShadowPanel] Saving field:', fieldKey, editValue)
      if (!projectId) {
        console.error('[ShadowPanel] No projectId')
        return
      }
      setSaving(true)
      try {
        const response = await fetch('/api/onboarding/update-field', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            projectId,
            scope,
            field: fieldKey,
            value: editValue,
          }),
        })
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error((err as { error?: string }).error ?? 'Update failed')
        }
        console.log('[ShadowPanel] Field saved successfully')
        onFieldUpdate?.(scope, fieldKey, editValue)
        setEditingField(null)
        setEditValue(null)
      } catch (error) {
        console.error('[ShadowPanel] Save failed:', error)
        alert('Failed to save changes. Please try again.')
      } finally {
        setSaving(false)
      }
    },
    [editValue, projectId, onFieldUpdate]
  )

  /** Composite key: "scope:fieldKey" so only one field is in edit mode at a time */
  const editKey = (scope: 'user' | 'project', fieldKey: string) => `${scope}:${fieldKey}`

  interface EditableFieldProps {
    scope: 'user' | 'project'
    fieldKey: string
    label: string
    value: unknown
    renderDisplay: (value: unknown) => React.ReactNode
    renderEdit: (value: unknown, onChange: (v: unknown) => void) => React.ReactNode
  }

  const EditableField = ({
    scope,
    fieldKey,
    label,
    value,
    renderDisplay,
    renderEdit,
  }: EditableFieldProps) => {
    const key = editKey(scope, fieldKey)
    const isEditing = editingField === key
    const isDisabled = editingField !== null && !isEditing

    return (
      <div
        className={`mb-4 animate-in fade-in duration-300 ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg shrink-0">check_circle</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-gray-700">{label}</span>
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => startEditing(key, value)}
                  disabled={isDisabled}
                  className="text-xs text-[#8B5CF6] hover:text-[#7C3AED] hover:underline disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  Edit
                </button>
              )}
            </div>
            {isEditing ? (
              <div>
                <div className="mb-2">{renderEdit(editValue, setEditValue)}</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveField(fieldKey, scope)}
                    disabled={saving}
                    className="px-3 py-1.5 bg-[#8B5CF6] text-white text-sm rounded-lg hover:bg-[#7C3AED] disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    disabled={saving}
                    className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>{renderDisplay(value)}</div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#FAF9F6]">
      {/* Fixed header: not inside scroll area so content never appears above it; solid background, no overlap */}
      <header className="shrink-0 border-b border-gray-200 bg-[#FAF9F6] px-8 pt-8 pb-4">
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

      {/* Scrollable content only — header stays fixed at top, nothing bleeds through */}
      <div className="min-h-0 flex-1 overflow-y-auto p-8 pt-6">
      {/* Section: Project Info */}
      <section className="mb-8">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Project Info</h3>
        <div className="border-b border-gray-200 pb-2 mb-4" />
        {project.title != null && project.title !== '' && (
          <EditableField
            scope="project"
            fieldKey="title"
            label="Title"
            value={project.title}
            renderDisplay={(v) => <p className="text-gray-900">{String(v)}</p>}
            renderEdit={(v, onChange) => (
              <input
                type="text"
                value={typeof v === 'string' ? v : ''}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]"
                autoFocus
              />
            )}
          />
        )}
        {project.description != null && project.description !== '' && (
          <EditableField
            scope="project"
            fieldKey="description"
            label="Description"
            value={project.description}
            renderDisplay={(v) => <p className="text-gray-900 text-sm">{String(v)}</p>}
            renderEdit={(v, onChange) => (
              <textarea
                value={typeof v === 'string' ? v : ''}
                onChange={(e) => onChange(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]"
                autoFocus
              />
            )}
          />
        )}
        {project.goals != null && project.goals !== '' && (
          <EditableField
            scope="project"
            fieldKey="goals"
            label="Goals"
            value={project.goals}
            renderDisplay={(v) => <p className="text-gray-900 text-sm">{String(v)}</p>}
            renderEdit={(v, onChange) => (
              <textarea
                value={typeof v === 'string' ? v : ''}
                onChange={(e) => onChange(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]"
                autoFocus
              />
            )}
          />
        )}
        {project.project_type != null && project.project_type !== '' && (
          <EditableField
            scope="project"
            fieldKey="project_type"
            label="Project type"
            value={project.project_type}
            renderDisplay={(v) => <p className="text-gray-900">{String(v)}</p>}
            renderEdit={(v, onChange) => (
              <input
                type="text"
                value={typeof v === 'string' ? v : ''}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]"
                autoFocus
              />
            )}
          />
        )}
        {project.target_deadline != null && project.target_deadline !== '' && (
          <EditableField
            scope="project"
            fieldKey="target_deadline"
            label="Target deadline"
            value={project.target_deadline}
            renderDisplay={(v) => <p className="text-gray-900">{formatDate(String(v))}</p>}
            renderEdit={(v, onChange) => (
              <input
                type="date"
                value={
                  typeof v === 'string'
                    ? v.slice(0, 10)
                    : v instanceof Date
                      ? v.toISOString().slice(0, 10)
                      : ''
                }
                onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : '')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]"
                autoFocus
              />
            )}
          />
        )}
        {project.motivation != null && project.motivation !== '' && (
          <EditableField
            scope="project"
            fieldKey="motivation"
            label="Motivation"
            value={project.motivation}
            renderDisplay={(v) => <p className="text-gray-900 text-sm">{String(v)}</p>}
            renderEdit={(v, onChange) => (
              <textarea
                value={typeof v === 'string' ? v : ''}
                onChange={(e) => onChange(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]"
                autoFocus
              />
            )}
          />
        )}
        {project.phases != null && typeof project.phases === 'object' && Object.keys(project.phases as object).length > 0 && (
          <div className="mb-4 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined mt-0.5 text-green-600 text-lg shrink-0">check_circle</span>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setPhasesExpanded(!phasesExpanded)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-[#8B5CF6]"
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
        {fields?.project?.projectNotes != null && fields.project.projectNotes !== '' && (
          <EditableField
            scope="project"
            fieldKey="projectNotes"
            label="Project Notes"
            value={fields.project.projectNotes}
            renderDisplay={(value) => {
              // Split by period into points; trim and filter empty to avoid empty bullets
              const str = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
              const points = str
                .split('.')
                .map((s: string) => s.trim())
                .filter((s: string) => s.length > 0)
              return (
                <ul className="list-disc list-inside space-y-1 text-gray-900 text-sm">
                  {points.map((point: string, idx: number) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              )
            }}
            renderEdit={(value, onChange) => (
              <textarea
                value={typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
                onChange={(e) => onChange(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                placeholder="Add project notes (separate points with periods)"
                autoFocus
              />
            )}
          />
        )}
      </section>

      {/* Section: Your Schedule */}
      <section className="mb-8">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Your Schedule</h3>
        <div className="border-b border-gray-200 pb-2 mb-4" />
        {user.workSchedule != null && typeof user.workSchedule === 'object' && (
          <EditableField
            scope="user"
            fieldKey="workSchedule"
            label="Work schedule"
            value={user.workSchedule}
            renderDisplay={(v) => {
              const ws = (v ?? {}) as { days?: string[]; start_time?: string; end_time?: string }
              const days = Array.isArray(ws.days) ? ws.days : []
              return (
                <div className="mt-2 grid grid-cols-7 gap-1 text-sm">
                  {DAYS_SHORT.map((day) => {
                    const fullDay = getDayName(day)
                    const isWorkDay = days.some((d) => dayMatches(day, d) || dayMatches(fullDay, d))
                    return (
                      <div key={day} className="text-center">
                        <div className="text-xs text-gray-500 mb-1">{day}</div>
                        <div
                          className={`text-xs py-1 rounded transition-all ${
                            isWorkDay ? 'bg-[#8B5CF6]/15 text-[#8B5CF6] font-medium' : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {isWorkDay ? `${formatTime(ws.start_time ?? '')}–${formatTime(ws.end_time ?? '')}` : '—'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            }}
            renderEdit={(v, onChange) => {
              const ws = (v ?? {}) as { days?: string[]; start_time?: string; end_time?: string }
              const days = Array.isArray(ws.days) ? ws.days : []
              return (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-2">Work days</label>
                    <div className="grid grid-cols-7 gap-2">
                      {DAYS_FULL.map((day) => {
                        const isSelected = days.some((d) => dayMatches(day, d) || dayMatches(day.substring(0, 3), d))
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              const newDays = isSelected
                                ? days.filter((d) => !dayMatches(day, d) && !dayMatches(day.substring(0, 3), d))
                                : [...days, day]
                              onChange({ ...ws, days: newDays })
                            }}
                            className={`text-xs py-2 rounded transition-all ${
                              isSelected ? 'bg-[#8B5CF6] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {day.substring(0, 3)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Start time</label>
                      <input
                        type="time"
                        value={ws.start_time ?? '09:00'}
                        onChange={(e) => onChange({ ...ws, start_time: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">End time</label>
                      <input
                        type="time"
                        value={ws.end_time ?? '17:00'}
                        onChange={(e) => onChange({ ...ws, end_time: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>
              )
            }}
          />
        )}
        {user.commute != null && typeof user.commute === 'object' && (
          <div className="mb-4 flex items-start gap-2 animate-in fade-in duration-300">
            <span className="material-symbols-outlined text-green-600 text-lg shrink-0">check_circle</span>
            <div>
              <div className="text-sm font-medium text-gray-700">Commute</div>
              <div className="space-y-1 text-sm text-gray-900">
                {(user.commute as { morning?: { duration?: number } }).morning != null && (
                  <div>Morning: {(user.commute as { morning: { duration: number } }).morning.duration} min</div>
                )}
                {(user.commute as { evening?: { duration?: number } }).evening != null && (
                  <div>Evening: {(user.commute as { evening: { duration: number } }).evening.duration} min</div>
                )}
              </div>
            </div>
          </div>
        )}
        {user.availabilityWindows != null && Array.isArray(user.availabilityWindows) && (user.availabilityWindows as unknown[]).length > 0 && (
          <EditableField
            scope="user"
            fieldKey="availabilityWindows"
            label="Availability windows"
            value={user.availabilityWindows}
            renderDisplay={(val) => (
              <div className="space-y-3 mt-2">
                {(val as Array<{ days?: string[]; start_time?: string; end_time?: string; type?: string }>).map((block, idx) => (
                  <div key={idx} className="border-l-2 border-green-400 pl-3">
                    {block.type != null && block.type !== '' && (
                      <div className="text-xs text-gray-500 mb-1">{block.type}</div>
                    )}
                    <div className="grid grid-cols-7 gap-1 text-xs">
                      {DAYS_FULL.map((day) => {
                        const days = Array.isArray(block.days) ? block.days : []
                        const isAvailable = days.some((d) => dayMatches(day, d) || dayMatches(day.substring(0, 3), d))
                        return (
                          <div key={day} className="text-center">
                            <div className="text-gray-500 mb-1">{day.substring(0, 3)}</div>
                            <div
                              className={`py-1 rounded ${isAvailable ? 'bg-green-100 text-green-700 font-medium' : 'bg-gray-50 text-gray-300'}`}
                            >
                              {isAvailable ? `${formatTime(block.start_time ?? '')}–${formatTime(block.end_time ?? '')}` : '—'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            renderEdit={(val, onChange) => {
              const value = (val ?? []) as Array<{ days?: string[]; start_time?: string; end_time?: string; type?: string }>
              return (
                <div className="space-y-4">
                  {value.map((block, idx) => (
                    <div key={idx} className="p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-700">Block {idx + 1}</span>
                        {value.length > 1 && (
                          <button
                            type="button"
                            onClick={() => onChange(value.filter((_, i) => i !== idx))}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={block.type ?? ''}
                        onChange={(e) => {
                          const newBlocks = [...value]
                          newBlocks[idx] = { ...block, type: e.target.value }
                          onChange(newBlocks)
                        }}
                        placeholder="Type (e.g. coding, meetings)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
                      />
                      <div className="grid grid-cols-7 gap-1 mb-3">
                        {DAYS_FULL.map((day) => {
                          const days = Array.isArray(block.days) ? block.days : []
                          const isSelected = days.some((d) => dayMatches(day, d) || dayMatches(day.substring(0, 3), d))
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => {
                                const newDays = isSelected
                                  ? days.filter((d) => !dayMatches(day, d) && !dayMatches(day.substring(0, 3), d))
                                  : [...days, day]
                                const newBlocks = [...value]
                                newBlocks[idx] = { ...block, days: newDays }
                                onChange(newBlocks)
                              }}
                              className={`text-xs py-2 rounded transition-all ${
                                isSelected ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {day.substring(0, 3)}
                            </button>
                          )
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="time"
                          value={block.start_time ?? '09:00'}
                          onChange={(e) => {
                            const newBlocks = [...value]
                            newBlocks[idx] = { ...block, start_time: e.target.value }
                            onChange(newBlocks)
                          }}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                        <input
                          type="time"
                          value={block.end_time ?? '17:00'}
                          onChange={(e) => {
                            const newBlocks = [...value]
                            newBlocks[idx] = { ...block, end_time: e.target.value }
                            onChange(newBlocks)
                          }}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      onChange([
                        ...value,
                        { days: [], start_time: '09:00', end_time: '17:00', type: '' },
                      ])
                    }
                    className="w-full px-3 py-2 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-[#8B5CF6] hover:text-[#8B5CF6] text-sm"
                  >
                    + Add time block
                  </button>
                </div>
              )
            }}
          />
        )}
        {project.weekly_hours_commitment != null && (
          <EditableField
            scope="project"
            fieldKey="weekly_hours_commitment"
            label="Weekly hours"
            value={project.weekly_hours_commitment}
            renderDisplay={(v) => <p className="text-gray-900">{Number(v)} hours per week</p>}
            renderEdit={(v, onChange) => (
              <input
                type="number"
                min={1}
                max={168}
                value={Number(v) || ''}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  onChange(Number.isNaN(n) ? 0 : n)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]"
                autoFocus
              />
            )}
          />
        )}
      </section>

      {/* Section: Preferences */}
      <section>
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Preferences</h3>
        <div className="border-b border-gray-200 pb-2 mb-4" />
        {user.timezone != null && user.timezone !== '' && (
          <EditableField
            scope="user"
            fieldKey="timezone"
            label="Timezone"
            value={user.timezone}
            renderDisplay={(v) => <p className="text-gray-900">{String(v)}</p>}
            renderEdit={(v, onChange) => (
              <input
                type="text"
                value={typeof v === 'string' ? v : ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder="e.g. Europe/Paris"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]"
                autoFocus
              />
            )}
          />
        )}
        {user.preferred_session_length != null && (
          <EditableField
            scope="user"
            fieldKey="preferred_session_length"
            label="Preferred session length"
            value={user.preferred_session_length}
            renderDisplay={(v) => (
              <p className="text-gray-900">
                {Number(v) >= 60 ? `${Math.round(Number(v) / 60)} hours` : `${v} minutes`}
              </p>
            )}
            renderEdit={(v, onChange) => (
              <input
                type="number"
                min={15}
                max={480}
                value={Number(v) || ''}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  onChange(Number.isNaN(n) ? 0 : n)
                }}
                placeholder="Minutes"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]"
                autoFocus
              />
            )}
          />
        )}
        {user.communication_style != null && user.communication_style !== '' && (
          <EditableField
            scope="user"
            fieldKey="communication_style"
            label="Communication style"
            value={user.communication_style}
            renderDisplay={(v) => <p className="text-gray-900 capitalize">{String(v)}</p>}
            renderEdit={(v, onChange) => (
              <input
                type="text"
                value={typeof v === 'string' ? v : ''}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]"
                autoFocus
              />
            )}
          />
        )}
        {project.skill_level != null && project.skill_level !== '' && (
          <EditableField
            scope="project"
            fieldKey="skill_level"
            label="Skill level"
            value={project.skill_level}
            renderDisplay={(v) => <p className="text-gray-900 capitalize">{String(v)}</p>}
            renderEdit={(v, onChange) => (
              <input
                type="text"
                value={typeof v === 'string' ? v : ''}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]"
                autoFocus
              />
            )}
          />
        )}
        {project.tools_and_stack != null && Array.isArray(project.tools_and_stack) && (project.tools_and_stack as string[]).length > 0 && (
          <EditableField
            scope="project"
            fieldKey="tools_and_stack"
            label="Tools & stack"
            value={project.tools_and_stack}
            renderDisplay={(v) => (
              <div className="flex flex-wrap gap-2 mt-1">
                {(v as string[]).map((tool) => (
                  <span key={tool} className="px-2 py-1 bg-[#8B5CF6]/15 text-[#8B5CF6] rounded text-xs">
                    {tool}
                  </span>
                ))}
              </div>
            )}
            renderEdit={(v, onChange) => {
              const arr = (Array.isArray(v) ? v : []) as string[]
              return (
                <div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {arr.map((tool, idx) => (
                      <span
                        key={`${tool}-${idx}`}
                        className="flex items-center gap-1 px-2 py-1 bg-[#8B5CF6]/15 text-[#8B5CF6] rounded text-xs"
                      >
                        {tool}
                        <button
                          type="button"
                          onClick={() => onChange(arr.filter((_, i) => i !== idx))}
                          className="text-[#8B5CF6] hover:text-[#7C3AED]"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Add tool (press Enter)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const input = e.currentTarget
                        const trimmed = input.value.trim()
                        if (trimmed) {
                          onChange([...arr, trimmed])
                          input.value = ''
                        }
                      }
                    }}
                  />
                </div>
              )
            }}
          />
        )}
        {fields?.user?.userNotes != null && fields.user.userNotes !== '' && (
          <EditableField
            scope="user"
            fieldKey="userNotes"
            label="Notes"
            value={fields.user.userNotes}
            renderDisplay={(value) => {
              // Split by period into points; trim and filter empty to avoid empty bullets
              const str = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
              const points = str
                .split('.')
                .map((s: string) => s.trim())
                .filter((s: string) => s.length > 0)
              return (
                <ul className="list-disc list-inside space-y-1 text-gray-900 text-sm">
                  {points.map((point: string, idx: number) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              )
            }}
            renderEdit={(value, onChange) => (
              <textarea
                value={typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
                onChange={(e) => onChange(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                placeholder="Add notes (separate points with periods)"
                autoFocus
              />
            )}
          />
        )}
      </section>
      </div>
    </div>
  )
}
