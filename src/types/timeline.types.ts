import type { ChecklistItem, TaskLabel } from '@/types/task.types'

export type TimelineTaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

export interface TimelineCompletedTask {
  id: string
  title: string
  completedAt: string | Date
}

export interface TimelineActiveTask {
  id: string
  title: string
  label: TaskLabel
  description: string
  scheduledDate: string | Date
  successCriteria: ChecklistItem[]
  depends_on: string[]
}

export interface TimelineUpcomingTask {
  id: string
  title: string
  scheduledDate: string | Date
}

export interface TimelineSkippedTask {
  id: string
  title: string
  label: TaskLabel
  scheduledDate: string | Date | null
  scheduledStartTime: string | Date | null
  scheduledEndTime: string | Date | null
}

export interface TimelineDependencyTask {
  id: string
  title: string
  status: TimelineTaskStatus
}

export interface TimelineData {
  lastCompletedTask: TimelineCompletedTask | null
  activeTask: TimelineActiveTask | null
  upcomingTasks: TimelineUpcomingTask[]
  skippedTasks: TimelineSkippedTask[]
  dependencies: TimelineDependencyTask[]
  dependentTasks: TimelineDependencyTask[]
}
