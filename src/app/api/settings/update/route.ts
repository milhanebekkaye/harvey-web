/**
 * POST /api/settings/update
 *
 * Persists Settings page changes: User (workSchedule, commute, preferred_session_length, communication_style)
 * and Project.contextData (available_time, preferences only). No blocked_time.
 */

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { createClient } from '@/lib/auth/supabase-server'
import { updateUser } from '@/lib/users/user-service'
import { getActiveProject } from '@/lib/tasks/task-service'
import { prisma } from '@/lib/db/prisma'
import type { SettingsUpdateBody } from '@/types/settings.types'

function validateTime(s: string): boolean {
  return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(s)
}

type WorkScheduleBlockPayload = { days?: number[]; startTime: string; endTime: string }
type WorkSchedulePayload = {
  workDays?: number[]
  startTime?: string
  endTime?: string
  blocks?: WorkScheduleBlockPayload[]
}

function validateWorkSchedule(ws: WorkSchedulePayload): string | null {
  const blocks = Array.isArray(ws.blocks) && ws.blocks.length > 0 ? ws.blocks : null
  if (blocks) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      if (!b || !validateTime(b.startTime) || !validateTime(b.endTime)) {
        return `workSchedule.blocks[${i}] must have startTime and endTime in HH:MM (24h)`
      }
      const days = Array.isArray(b.days) && b.days.length > 0 ? b.days : [1, 2, 3, 4, 5]
      if (days.some((d) => typeof d !== 'number' || d < 0 || d > 6)) {
        return `workSchedule.blocks[${i}].days must be an array of 0-6`
      }
      const [sh, sm] = b.startTime.split(':').map(Number)
      const [eh, em] = b.endTime.split(':').map(Number)
      const startM = sh * 60 + sm
      const endM = eh * 60 + em
      if (endM <= startM) {
        return `workSchedule.blocks[${i}] end time must be after start time`
      }
    }
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i]
        const b = blocks[j]
        const aDays = new Set(Array.isArray(a.days) && a.days.length > 0 ? a.days : [1, 2, 3, 4, 5])
        const bDays = new Set(Array.isArray(b.days) && b.days.length > 0 ? b.days : [1, 2, 3, 4, 5])
        const sharedDays = [...aDays].filter((d) => bDays.has(d))
        if (sharedDays.length === 0) continue
        const aStart = a.startTime.split(':').map(Number) as [number, number]
        const aEnd = a.endTime.split(':').map(Number) as [number, number]
        const bStart = b.startTime.split(':').map(Number) as [number, number]
        const bEnd = b.endTime.split(':').map(Number) as [number, number]
        const aS = aStart[0] * 60 + aStart[1]
        const aE = aEnd[0] * 60 + aEnd[1]
        const bS = bStart[0] * 60 + bStart[1]
        const bE = bEnd[0] * 60 + bEnd[1]
        if (aS < bE && bS < aE) {
          return 'workSchedule.blocks overlap on the same day (same day selected with overlapping times)'
        }
      }
    }
    return null
  }
  if (!Array.isArray(ws.workDays) || ws.workDays.some((d) => typeof d !== 'number' || d < 0 || d > 6)) {
    return 'workSchedule.workDays must be an array of 0-6'
  }
  if (!ws.startTime || !validateTime(ws.startTime)) {
    return 'workSchedule.startTime must be HH:MM (24h)'
  }
  if (!ws.endTime || !validateTime(ws.endTime)) {
    return 'workSchedule.endTime must be HH:MM (24h)'
  }
  return null
}

/**
 * Normalize a block's segment on its start day for overlap checking.
 * Overnight blocks (end <= start) only cover [start, 24:00) on that day; the rest is on the next day.
 */
function segmentMinutesOnDay(startM: number, endM: number): { start: number; end: number } {
  if (endM > startM) return { start: startM, end: endM }
  // Overnight: on the block's day we only have [start, 24*60)
  return { start: startM, end: 24 * 60 }
}

function validateAvailabilityBlocks(blocks: { day: string; start: string; end: string }[]): string | null {
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  for (const b of blocks) {
    const day = b.day.toLowerCase()
    if (!dayNames.includes(day)) return `Invalid day: ${b.day}`
    if (!validateTime(b.start)) return `Invalid start time: ${b.start}`
    if (!validateTime(b.end)) return `Invalid end time: ${b.end}`
    const [sh, sm] = b.start.split(':').map(Number)
    const [eh, em] = b.end.split(':').map(Number)
    const startM = sh * 60 + sm
    const endM = eh * 60 + em
    // end <= start is valid: overnight block (e.g. Friday 23:00 - Saturday 02:00)
    if (endM === startM) return `End time must be different from start time for ${b.day} ${b.start}-${b.end}`
  }
  // Overlap check: for each day, collect all segments (including overnight continuation from previous day), then check pairwise
  const prevDay = (d: string) => dayNames[(dayNames.indexOf(d) + 6) % 7]
  for (const day of dayNames) {
    const segments: { start: number; end: number; label: string }[] = []
    for (const b of blocks) {
      const d = b.day.toLowerCase()
      const [sh, sm] = b.start.split(':').map(Number)
      const [eh, em] = b.end.split(':').map(Number)
      const startM = sh * 60 + sm
      const endM = eh * 60 + em
      const label = `${b.day} ${b.start}-${b.end}`
      if (d === day) {
        const seg = segmentMinutesOnDay(startM, endM)
        segments.push({ ...seg, label })
      } else if (prevDay(day) === d && endM <= startM) {
        // Overnight block from previous day continues into this day as [0, end)
        segments.push({ start: 0, end: endM, label })
      }
    }
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const a = segments[i]
        const b = segments[j]
        if (a.start < b.end && b.start < a.end) {
          return `Overlapping blocks on ${day}: ${a.label} and ${b.label}`
        }
      }
    }
  }
  return null
}

export async function POST(request: Request) {
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

    let body: SettingsUpdateBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    console.log('[SettingsAPI] POST body received', {
      has_workSchedule: body.workSchedule != null,
      has_available_time: body.available_time != null,
      available_time_count: Array.isArray(body.available_time) ? body.available_time.length : 0,
      preferences: body.preferences,
      projectId: body.projectId,
    })

    if (body.workSchedule != null) {
      const err = validateWorkSchedule(body.workSchedule as WorkSchedulePayload)
      if (err) {
        return NextResponse.json(
          { error: err, code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }
    }

    if (body.available_time != null) {
      const err = validateAvailabilityBlocks(body.available_time)
      if (err) {
        return NextResponse.json(
          { error: err, code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }
    }

    const VALID_ENERGY_PEAK = ['mornings', 'afternoons', 'evenings'] as const
    if (body.preferences != null && body.preferences.energy_peak != null) {
      const v = body.preferences.energy_peak
      if (typeof v !== 'string' || !VALID_ENERGY_PEAK.includes(v as (typeof VALID_ENERGY_PEAK)[number])) {
        return NextResponse.json(
          { error: 'preferences.energy_peak must be one of: mornings, afternoons, evenings', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      }
    }

    // Resolve project for contextData update (same project GET /api/settings returns)
    const projectId =
      body.projectId ??
      (await getActiveProject(user.id).then((r) => (r.success && r.data ? r.data.id : null)))

    if (body.workSchedule !== undefined || body.commute !== undefined || body.preferred_session_length !== undefined || body.communication_style !== undefined) {
      const userUpdate: Parameters<typeof updateUser>[1] = {}
      if (body.workSchedule !== undefined) userUpdate.workSchedule = body.workSchedule
      if (body.commute !== undefined) userUpdate.commute = body.commute
      if (body.preferred_session_length !== undefined) userUpdate.preferred_session_length = body.preferred_session_length ?? undefined
      if (body.communication_style !== undefined) userUpdate.communication_style = body.communication_style ?? undefined
      const result = await updateUser(user.id, userUpdate)
      if (!result.success) {
        return NextResponse.json(
          { error: result.error?.message ?? 'Failed to update user' },
          { status: 500 }
        )
      }
    }

    // Persist available_time and preferences to Project.contextData (same place GET /api/settings reads from)
    if (projectId && (body.available_time !== undefined || body.preferences !== undefined)) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: user.id },
      })
      if (!project) {
        return NextResponse.json(
          { error: 'Project not found', code: 'PROJECT_NOT_FOUND' },
          { status: 404 }
        )
      }
      const raw = project.contextData
      const existing: Record<string, unknown> =
        raw != null && typeof raw === 'object' && !Array.isArray(raw)
          ? { ...(raw as Record<string, unknown>) }
          : {}

      const dayOrder = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const sortedAvailableTime: unknown[] =
        body.available_time !== undefined
          ? [...body.available_time].sort((a, b) => {
              const ai = dayOrder.indexOf(a.day.toLowerCase())
              const bi = dayOrder.indexOf(b.day.toLowerCase())
              if (ai !== bi) return ai - bi
              return a.start.localeCompare(b.start)
            })
          : Array.isArray(existing.available_time) ? existing.available_time : []

      const mergedPreferences =
        body.preferences !== undefined
          ? { ...(typeof existing.preferences === 'object' && existing.preferences && !Array.isArray(existing.preferences) ? (existing.preferences as object) : {}), ...body.preferences }
          : existing.preferences

      const newContextData = {
        ...existing,
        available_time: sortedAvailableTime,
        preferences: mergedPreferences,
      }

      console.log('[SettingsAPI] Saving project contextData', {
        projectId,
        available_time_count: sortedAvailableTime.length,
        available_time: sortedAvailableTime,
      })

      await prisma.project.update({
        where: { id: projectId },
        data: { contextData: newContextData as Prisma.InputJsonValue, updatedAt: new Date() },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[SettingsAPI] POST update error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save settings' },
      { status: 500 }
    )
  }
}
