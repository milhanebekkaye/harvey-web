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
import type { SettingsGetResponse, AvailabilityBlock, SettingsPreferences } from '@/types/settings.types'

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
        ? (dbUser.workSchedule as SettingsGetResponse['user']['workSchedule'])
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
