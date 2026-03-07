'use client'

import { ArrowLeft, Calendar, Plus, X } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { SettingsGetResponse, SettingsUpdateBody, AvailabilityBlock, UserNoteEntry } from '@/types/settings.types'
import { WorkScheduleSection } from '@/components/settings/WorkScheduleSection'
import { AvailabilitySection } from '@/components/settings/AvailabilitySection'
import { PreferencesSection } from '@/components/settings/PreferencesSection'

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

interface UserProfile {
  name: string | null
  payment_status: string
  email?: string | null
}

export default function SettingsPage() {
  const router = useRouter()
  const [data, setData] = useState<SettingsGetResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState<SettingsGetResponse | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [activeSection, setActiveSection] = useState<'schedule' | 'preferences' | 'notes'>('schedule')
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set())

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
      setSavedSnapshot(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [router])

  const fetchUserProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/user/me')
      if (res.ok) {
        const json = await res.json()
        setUserProfile({
          name: json.name ?? null,
          payment_status: json.payment_status ?? 'free',
          email: json.email ?? null,
        })
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    if (!loading) fetchUserProfile()
  }, [loading, fetchUserProfile])

  const handleSave = async () => {
    if (!data) return
    setSaving(true)
    setSaveStatus('saving')
    setError(null)
    try {
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
      fetch('/api/settings')
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json?.project != null && json?.user != null) {
            const updatedData = { user: json.user, project: json.project }
            setData(updatedData)
            setSavedSnapshot(updatedData)
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

  const hasChanges =
    savedSnapshot !== null &&
    data !== null &&
    JSON.stringify(data) !== JSON.stringify(savedSnapshot)

  const handleDiscard = () => {
    if (savedSnapshot) setData(savedSnapshot)
  }

  const handleNavigate = useCallback(
    (href: string) => {
      if (hasChanges && !window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        return
      }
      router.push(href)
    },
    [hasChanges, router]
  )

  useEffect(() => {
    if (!hasChanges) return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasChanges])

  const isPro = userProfile?.payment_status && ['active', 'pro', 'paid'].includes(userProfile.payment_status)
  const displayName = userProfile?.name?.trim() || userProfile?.email || 'Signed in'
  const notesCount = data?.user?.userNotes?.length ?? 0

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="text-slate-500">Loading settings...</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
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
    <div className="min-h-screen bg-[#FAFAF8] overflow-y-auto">
      {/* 1. Fixed top bar — stays at top when scrolling */}
      <header className="fixed top-0 left-0 right-0 z-20 backdrop-blur-[20px] bg-[rgba(250,250,248,0.92)] border-b border-black/[0.06]">
        <div className="max-w-5xl mx-auto px-10 h-14 flex items-center justify-between">
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

      <div className="max-w-5xl mx-auto px-10 pt-14 pb-24">
        {/* 2. Header */}
        <section className="flex flex-wrap items-start justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Settings</h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage your schedule, preferences, and how Harvey works with you.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-full bg-gradient-to-r from-[#895af6] to-[#7849d9] flex items-center justify-center text-white font-semibold text-sm shrink-0"
              aria-hidden
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
              <p className="text-xs text-slate-400 truncate">
                {userProfile?.email ?? '—'}
              </p>
            </div>
            <div className="w-px h-10 bg-slate-100 shrink-0" />
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                isPro ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {isPro ? 'Pro Plan' : 'Free Plan'}
            </span>
          </div>
        </section>

        {error && saveStatus === 'error' && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* 3. Tab bar — sticks below fixed header */}
        <div className="sticky top-14 z-10 bg-[#FAFAF8] border-b border-slate-200/80 -mx-10 px-10 pb-0">
          <div className="flex gap-8">
            <button
              type="button"
              onClick={() => setActiveSection('schedule')}
              className={`text-sm font-medium pb-3 border-b-2 transition-colors ${
                activeSection === 'schedule'
                  ? 'text-slate-900 border-violet-500'
                  : 'text-slate-400 border-transparent hover:text-slate-600'
              }`}
            >
              Schedule
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('preferences')}
              className={`text-sm font-medium pb-3 border-b-2 transition-colors ${
                activeSection === 'preferences'
                  ? 'text-slate-900 border-violet-500'
                  : 'text-slate-400 border-transparent hover:text-slate-600'
              }`}
            >
              Preferences
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('notes')}
              className={`text-sm font-medium pb-3 border-b-2 transition-colors flex items-center gap-2 ${
                activeSection === 'notes'
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

        {/* 4. Tab content */}
        {data && (
          <div className="mt-6">
            {activeSection === 'schedule' && (
              <div className="space-y-8">
                <WorkScheduleSection
                  workSchedule={data.user.workSchedule}
                  commute={data.user.commute}
                  onChange={(workSchedule, commute) => {
                    updateUser({ workSchedule, commute })
                  }}
                  variant="card"
                />
                {data.project ? (
                  <AvailabilitySection
                    availableTime={data.project.contextData.available_time ?? []}
                    workSchedule={data.user.workSchedule}
                    commute={data.user.commute}
                    onChange={(available_time) => updateProjectContext({ available_time })}
                    variant="card"
                  />
                ) : (
                  <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-[rgba(137,91,245,0.06)] flex items-center justify-center shrink-0">
                        <Calendar className="w-5 h-5 text-[#895bf5]" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-800">Availability Windows</h2>
                        <p className="text-sm text-slate-500">Complete onboarding to add availability blocks for your project.</p>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            )}

            {activeSection === 'preferences' && (
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
                variant="grid"
              />
            )}

            {activeSection === 'notes' && (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <div className="rounded-xl bg-violet-500/10 border border-violet-200/50 px-4 py-3 mb-6 flex items-start gap-3">
                  <span className="text-lg" aria-hidden>🧠</span>
                  <p className="text-sm text-slate-700">
                    Observations Harvey has made about your working style and preferences.
                  </p>
                </div>
                <ul className="space-y-4">
                  {[...(data.user.userNotes ?? [])].reverse().map((entry: UserNoteEntry, displayIndex: number) => {
                    const notes = data.user.userNotes ?? []
                    const realIndex = notes.length - 1 - displayIndex
                    const isExpanded = expandedNotes.has(realIndex)
                    const isLong = entry.note.length > 200
                    const showTruncated = isLong && !isExpanded
                    const hasKeyInsight = /CRITICAL|struggles/i.test(entry.note)
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
                      <li key={realIndex} className="flex gap-4">
                        <div className="w-20 shrink-0 text-xs text-slate-400 pt-2">
                          {entry.extracted_at ? formatNoteDate(entry.extracted_at) : '—'}
                        </div>
                        <div className="min-w-0 flex-1">
                          {hasKeyInsight && (
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
                              onClick={() =>
                                setExpandedNotes((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(realIndex)) next.delete(realIndex)
                                  else next.add(realIndex)
                                  return next
                                })
                              }
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
                    const notes = [...(data.user.userNotes ?? [])]
                    notes.push({ note: '', extracted_at: new Date().toISOString() })
                    updateUser({ userNotes: notes })
                  }}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:border-violet-500/50 hover:bg-violet-500/5 hover:text-violet-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Add Note
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
