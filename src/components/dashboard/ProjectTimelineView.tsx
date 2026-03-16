'use client'

import { TimelineView } from '@/components/dashboard/timeline'

interface ProjectTimelineViewProps {
  projectId: string | null
  onComplete?: (taskId: string) => void | Promise<void>
  onSkip?: (taskId: string) => void | Promise<void>
  onAskHarvey?: (taskId: string, title: string, label: string) => void | Promise<void>
  /** Called after a task is deleted (e.g. from timeline) to refresh task list and timeline. */
  onTaskDeleted?: (taskId: string) => void | Promise<void>
  /** Increment to silently refetch timeline data (e.g. after a reorder in list view). */
  refreshTrigger?: number
}

export function ProjectTimelineView({
  projectId,
  onComplete,
  onSkip,
  onAskHarvey,
  onTaskDeleted,
  refreshTrigger,
}: ProjectTimelineViewProps) {
  return (
    <TimelineView
      projectId={projectId}
      onComplete={onComplete}
      onSkip={onSkip}
      onAskHarvey={onAskHarvey}
      onTaskDeleted={onTaskDeleted}
      refreshTrigger={refreshTrigger}
    />
  )
}
