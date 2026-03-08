/**
 * Settings page types.
 * User life constraints and project fields for GET/POST settings API.
 * Scheduling data lives on User (availabilityWindows, energy_peak, rest_days) and Project (schedule_duration_days, exclusions).
 */

import type { WorkScheduleShape, CommuteShape } from './api.types'

export type { WorkScheduleShape, CommuteShape }

/** Availability block (User.availabilityWindows or display shape). */
export interface AvailabilityBlock {
  day: string
  start: string
  end: string
  label?: string
  type?: 'work' | 'personal'
}

/** Preferences slice (energy_peak, rest_days now on User). */
export interface SettingsPreferences {
  energy_peak?: string
  rest_days?: string[]
}

/** Note with timestamp (User.userNotes / Harvey's notes about the user). */
export interface UserNoteEntry {
  note: string
  extracted_at?: string
}

/** Payload returned by GET /api/settings. */
export interface SettingsGetResponse {
  user: {
    workSchedule: WorkScheduleShape | null
    commute: CommuteShape | null
    preferred_session_length: number | null
    communication_style: string | null
    timezone: string
    userNotes: UserNoteEntry[] | null
    availabilityWindows: unknown
    energy_peak: string | null
    rest_days: string[]
  }
  project: {
    id: string
    schedule_duration_days: number | null
    exclusions: string[]
  } | null
}

/** Payload sent to POST /api/settings/update. */
export interface SettingsUpdateBody {
  workSchedule?: WorkScheduleShape | null
  commute?: CommuteShape | null
  preferred_session_length?: number | null
  communication_style?: string | null
  userNotes?: UserNoteEntry[] | null
  availabilityWindows?: unknown
  energy_peak?: string | null
  rest_days?: string[]
  schedule_duration_days?: number | null
  exclusions?: string[]
  projectId?: string
}
