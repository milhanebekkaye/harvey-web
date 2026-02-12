/**
 * Settings page types.
 * User life constraints and project contextData shapes for GET/POST settings API.
 */

import type { WorkScheduleShape, CommuteShape } from './api.types'

export type { WorkScheduleShape, CommuteShape }

/** Availability block (Project.contextData.available_time entry). */
export interface AvailabilityBlock {
  day: string
  start: string
  end: string
  label?: string
  type?: 'work' | 'personal'
}

/** Project.contextData preferences slice used by Settings. */
export interface SettingsPreferences {
  energy_peak?: string
  rest_days?: string[]
}

/** Payload returned by GET /api/settings. */
export interface SettingsGetResponse {
  user: {
    workSchedule: WorkScheduleShape | null
    commute: CommuteShape | null
    preferred_session_length: number | null
    communication_style: string | null
    timezone: string
  }
  project: {
    id: string
    contextData: {
      available_time: AvailabilityBlock[]
      preferences: SettingsPreferences
    }
  } | null
}

/** Payload sent to POST /api/settings/update. */
export interface SettingsUpdateBody {
  workSchedule?: WorkScheduleShape | null
  commute?: CommuteShape | null
  preferred_session_length?: number | null
  communication_style?: string | null
  available_time?: AvailabilityBlock[]
  preferences?: Partial<SettingsPreferences>
  projectId?: string
}
