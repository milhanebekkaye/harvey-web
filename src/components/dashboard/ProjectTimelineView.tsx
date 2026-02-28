'use client'

import { TimelineView } from '@/components/timeline'

interface ProjectTimelineViewProps {
  projectId: string | null
  onComplete?: (taskId: string) => void | Promise<void>
  onSkip?: (taskId: string) => void | Promise<void>
  onAskHarvey?: (taskId: string, title: string, label: string) => void | Promise<void>
  /** Increment to silently refetch timeline data (e.g. after a reorder in list view). */
  refreshTrigger?: number
}

export function ProjectTimelineView({
  projectId,
  onComplete,
  onSkip,
  onAskHarvey,
  refreshTrigger,
}: ProjectTimelineViewProps) {
  return (
    <TimelineView
      projectId={projectId}
      onComplete={onComplete}
      onSkip={onSkip}
      onAskHarvey={onAskHarvey}
      refreshTrigger={refreshTrigger}
    />
  )
}
