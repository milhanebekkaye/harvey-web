'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { SettingsGetResponse, SettingsUpdateBody, AvailabilityBlock, UserNoteEntry } from '@/types/settings.types'

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
import { WorkScheduleSection } from '@/components/settings/WorkScheduleSection'
import { AvailabilitySection } from '@/components/settings/AvailabilitySection'
import { PreferencesSection } from '@/components/settings/PreferencesSection'

export default function SettingsPage() {
  const router = useRouter()
  const [data, setData] = useState<SettingsGetResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/signin')
          return
        }
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? `Failed to load settings (${res.status})`)
      }
      const json: SettingsGetResponse = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleSave = async () => {
    if (!data) return
    setSaving(true)
    setSaveStatus('saving')
    setError(null)
    try {
      // Build payload: include projectId when we have a project so availability is stored in Project.contextData.available_time
      const availableTime = data.project?.contextData?.available_time ?? []
      const body: SettingsUpdateBody = {
        workSchedule: data.user.workSchedule,
        commute: data.user.commute,
        preferred_session_length: data.user.preferred_session_length,
        communication_style: data.user.communication_style,
        userNotes: data.user.userNotes ?? null,
        available_time: availableTime,
        preferences: data.project?.contextData?.preferences ?? {},
        projectId: data.project?.id ?? undefined,
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('[Settings] Saving payload', {
          available_time_count: body.available_time?.length ?? 0,
          available_time: body.available_time,
          projectId: body.projectId,
        })
      }
      const res = await fetch('/api/settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Failed to save')
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
      // Refetch in background so UI shows what was persisted (same source as GET /api/settings)
      fetch('/api/settings')
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json?.project != null && json?.user != null) {
            setData({
              user: json.user,
              project: json.project,
            })
          }
        })
        .catch(() => {})
    } catch (e) {
      setSaveStatus('error')
      setError(e instanceof Error ? e.message : 'Failed to save settings')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } finally {
      setSaving(false)
    }
  }

  const updateUser = useCallback(
    (updates: Partial<SettingsGetResponse['user']>) => {
      setData((prev) =>
        prev ? { ...prev, user: { ...prev.user, ...updates } } : null
      )
    },
    []
  )

  const updateProjectContext = useCallback(
    (updates: { available_time?: AvailabilityBlock[]; preferences?: Record<string, unknown> }) => {
      setData((prev) => {
        if (!prev?.project) return prev
        return {
          ...prev,
          project: {
            ...prev.project,
            contextData: { ...prev.project.contextData, ...updates },
          },
        }
      })
    },
    []
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="text-slate-500">Loading settings...</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-slate-600 mb-4">{error}</p>
          <button
            onClick={() => fetchSettings()}
            className="px-4 py-2 bg-[#895af6] text-white rounded-lg font-medium hover:bg-[#7849d9]"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/dashboard"
              className="text-sm text-[#62499c] hover:text-[#895af6] font-medium"
            >
              ← Back to dashboard
            </Link>
            <h1 className="text-2xl font-bold text-slate-800 mt-2">Settings</h1>
            <p className="text-slate-500 text-sm mt-1">
              Manage your work schedule, availability, and preferences.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-[#895af6] text-white rounded-xl font-medium hover:bg-[#7849d9] disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'saved' && 'Saved ✓'}
            {saveStatus === 'error' && 'Error'}
            {saveStatus === 'idle' && !saving && 'Save'}
          </button>
        </div>

        {error && saveStatus === 'error' && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {data && (
          <div className="space-y-8">
            <WorkScheduleSection
              workSchedule={data.user.workSchedule}
              commute={data.user.commute}
              onChange={(workSchedule, commute) => {
                updateUser({ workSchedule, commute })
              }}
            />
            {data.project ? (
              <AvailabilitySection
                availableTime={data.project.contextData.available_time ?? []}
                workSchedule={data.user.workSchedule}
                commute={data.user.commute}
                onChange={(available_time) => updateProjectContext({ available_time })}
              />
            ) : (
              <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
                <h2 className="text-lg font-semibold text-slate-800 mb-2">Availability Windows</h2>
                <p className="text-slate-500 text-sm">Complete onboarding to add availability blocks for your project.</p>
              </section>
            )}
            <PreferencesSection
              energyPeak={data.project?.contextData.preferences?.energy_peak}
              restDays={data.project?.contextData.preferences?.rest_days ?? []}
              preferredSessionLength={data.user.preferred_session_length}
              communicationStyle={data.user.communication_style}
              onChangeUser={(preferred_session_length, communication_style) =>
                updateUser({ preferred_session_length, communication_style })
              }
              onChangePreferences={(preferences) =>
                updateProjectContext({
                  preferences: { ...(data.project?.contextData.preferences ?? {}), ...preferences },
                })
              }
            />
            {/* Harvey's Notes — same as project details, for user-level notes */}
            <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 hover:shadow-md transition-shadow">
              <h2 className="text-lg font-semibold text-slate-800 mb-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-slate-500">lightbulb</span>
                Harvey&apos;s Notes
              </h2>
              <p className="text-slate-500 text-sm mb-5">
                Observations about you (working style, preferences). Add or edit notes below, then click &quot;Save&quot; at the top to store them.
              </p>
              {(data.user.userNotes?.length ?? 0) > 0 ? (
                <ul className="space-y-4">
                  {[...(data.user.userNotes ?? [])].reverse().map((entry: UserNoteEntry, displayIndex: number) => {
                    const notes = data.user.userNotes ?? []
                    const realIndex = notes.length - 1 - displayIndex
                    const updateNote = (note: string) => {
                      const next = [...notes]
                      next[realIndex] = { ...entry, note }
                      updateUser({ userNotes: next })
                    }
                    const removeNote = () => {
                      const next = notes.filter((_, i) => i !== realIndex)
                      updateUser({ userNotes: next.length ? next : null })
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
                  const notes = [...(data.user.userNotes ?? [])]
                  notes.push({ note: '', extracted_at: new Date().toISOString() })
                  updateUser({ userNotes: notes })
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-base font-medium text-slate-600 hover:border-[#895af6]/50 hover:bg-[#895af6]/5 hover:text-[#895af6] transition-colors"
              >
                <span className="material-symbols-outlined text-xl">add</span>
                Add note
              </button>
              {!(data.user.userNotes?.length ?? 0) && (
                <p className="text-sm text-slate-400 mt-3">Click &quot;Add note&quot; to create one, or let Harvey add observations as you chat. Remember to click &quot;Save&quot; to store them.</p>
              )}
            </section>
            <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-2">Project</h2>
              <p className="text-slate-500 text-sm mb-4">
                View and edit what Harvey knows about your project (goals, deadline, tools).
              </p>
              {data.project ? (
                <Link
                  href={`/dashboard/project/${data.project.id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
                >
                  View Project Details
                </Link>
              ) : (
                <p className="text-sm text-slate-500">Complete onboarding to add a project.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
