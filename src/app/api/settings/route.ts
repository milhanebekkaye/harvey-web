/**
 * GET /api/settings
 *
 * Returns the current user's settings and active project context for the Settings page.
 * User: workSchedule, commute, preferred_session_length, communication_style, timezone.
 * Project: id, contextData (available_time, preferences only — no blocked_time).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { getUserById } from '@/lib/users/user-service'
import { getActiveProject } from '@/lib/tasks/task-service'
import type { SettingsGetResponse, AvailabilityBlock, SettingsPreferences, UserNoteEntry } from '@/types/settings.types'
import type { WorkScheduleShape } from '@/types/api.types'

const DAY_NAME_TO_NUM: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

function normalizeWorkScheduleForGet(raw: unknown): SettingsGetResponse['user']['workSchedule'] {
  if (raw == null || typeof raw !== 'object') return null
  const ws = raw as Record<string, unknown>
  // Already canonical: blocks or workDays + startTime + endTime
  if (Array.isArray(ws.blocks) && ws.blocks.length > 0) {
    return raw as WorkScheduleShape
  }
  if (
    Array.isArray(ws.workDays) &&
    ws.workDays.length > 0 &&
    typeof ws.startTime === 'string' &&
    typeof ws.endTime === 'string'
  ) {
    return raw as WorkScheduleShape
  }
  // Extraction format: days (string[]) + start_time, end_time
  const days = ws.days as string[] | number[] | undefined
  const start = (ws.startTime ?? ws.start_time) as string | undefined
  const end = (ws.endTime ?? ws.end_time) as string | undefined
  if (!start || !end) return null
  let workDaysNum: number[] = [1, 2, 3, 4, 5]
  if (Array.isArray(days) && days.length > 0) {
    workDaysNum = days
      .map((d) =>
        typeof d === 'number' ? (d >= 0 && d <= 6 ? d : undefined) : DAY_NAME_TO_NUM[String(d).toLowerCase()]
      )
      .filter((n): n is number => n !== undefined)
    workDaysNum = [...new Set(workDaysNum)].sort((a, b) => a - b)
    if (workDaysNum.length === 0) workDaysNum = [1, 2, 3, 4, 5]
  }
  return { workDays: workDaysNum, startTime: start, endTime: end }
}

function normalizeUserNotes(raw: unknown): UserNoteEntry[] | null {
  if (raw == null) return null
  if (Array.isArray(raw) && raw.length > 0) {
    const entries: UserNoteEntry[] = []
    for (const item of raw) {
      if (item && typeof item === 'object' && 'note' in item && typeof (item as { note: unknown }).note === 'string') {
        const { note, extracted_at } = item as { note: string; extracted_at?: string }
        entries.push({ note, ...(extracted_at ? { extracted_at } : {}) })
      }
    }
    return entries.length ? entries : null
  }
  if (typeof raw === 'string' && raw.trim()) {
    return [{ note: raw.trim() }]
  }
  return null
}

export async function GET() {
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

    const dbUser = await getUserById(user.id)
    if (!dbUser) {
      return NextResponse.json(
        { error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 404 }
      )
    }

    const projectResult = await getActiveProject(user.id)
    const project = projectResult.success ? projectResult.data : null

    const workSchedule =
      dbUser.workSchedule && typeof dbUser.workSchedule === 'object' && dbUser.workSchedule !== null
        ? normalizeWorkScheduleForGet(dbUser.workSchedule)
        : null
    const commute =
      dbUser.commute && typeof dbUser.commute === 'object' && dbUser.commute !== null
        ? (dbUser.commute as SettingsGetResponse['user']['commute'])
        : null

    const rawContext = project?.contextData as { available_time?: AvailabilityBlock[]; preferences?: SettingsPreferences } | null
    const response: SettingsGetResponse = {
      user: {
        workSchedule,
        commute,
        preferred_session_length: dbUser.preferred_session_length ?? null,
        communication_style: dbUser.communication_style ?? null,
        timezone: dbUser.timezone ?? 'Europe/Paris',
        userNotes: normalizeUserNotes(dbUser.userNotes),
      },
      project: project
        ? {
            id: project.id,
            contextData: {
              available_time: Array.isArray(rawContext?.available_time) ? rawContext.available_time : [],
              preferences: rawContext?.preferences ?? {},
            },
          }
        : null,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[SettingsAPI] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load settings' },
      { status: 500 }
    )
  }
}
