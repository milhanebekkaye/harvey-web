'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ActiveTaskCard } from '@/components/timeline/ActiveTaskCard'
import { CompletedTaskCard } from '@/components/timeline/CompletedTaskCard'
import { TimelineRail } from '@/components/timeline/TimelineRail'
import { UpcomingTaskCard } from '@/components/timeline/UpcomingTaskCard'
import type { ChecklistItem } from '@/types/task.types'
import type { TimelineData } from '@/types/timeline.types'

interface TimelineViewProps {
  projectId: string | null
  onComplete?: (taskId: string) => void | Promise<void>
  onSkip?: (taskId: string) => void | Promise<void>
  onAskHarvey?: (taskId: string, title: string, label: string) => void | Promise<void>
}

interface TimelineApiResponse extends TimelineData {
  success: boolean
  error?: string
}

export function TimelineView({
  projectId,
  onComplete,
  onSkip,
  onAskHarvey,
}: TimelineViewProps) {
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const showToast = useCallback((message: string) => {
    setToast(message)

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 3200)
  }, [])

  const fetchTimeline = useCallback(async () => {
    if (!projectId) {
      setTimelineData(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`/api/timeline?projectId=${encodeURIComponent(projectId)}`)
      const json = (await response.json()) as TimelineApiResponse

      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Failed to load timeline')
      }

      setTimelineData({
        lastCompletedTask: json.lastCompletedTask,
        activeTask: json.activeTask,
        upcomingTasks: json.upcomingTasks,
        dependencies: json.dependencies,
        dependentTasks: json.dependentTasks,
      })
    } catch (error: unknown) {
      setTimelineData({
        lastCompletedTask: null,
        activeTask: null,
        upcomingTasks: [],
        dependencies: [],
        dependentTasks: [],
      })

      showToast(error instanceof Error ? error.message : 'Failed to load timeline')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, showToast])

  useEffect(() => {
    void fetchTimeline()
  }, [fetchTimeline])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  const handleCriteriaChange = async (criteria: ChecklistItem[]) => {
    if (!timelineData?.activeTask) return

    const previousCriteria = timelineData.activeTask.successCriteria

    setTimelineData((prev) => {
      if (!prev?.activeTask) return prev

      return {
        ...prev,
        activeTask: {
          ...prev.activeTask,
          successCriteria: criteria,
        },
      }
    })

    try {
      const response = await fetch(`/api/tasks/${timelineData.activeTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ successCriteria: criteria }),
      })

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}))
        throw new Error(errorJson.error || 'Failed to save success criteria')
      }
    } catch (error: unknown) {
      setTimelineData((prev) => {
        if (!prev?.activeTask) return prev

        return {
          ...prev,
          activeTask: {
            ...prev.activeTask,
            successCriteria: previousCriteria,
          },
        }
      })

      showToast(error instanceof Error ? error.message : 'Failed to save success criteria')
    }
  }

  const handleComplete = async (taskId: string) => {
    await onComplete?.(taskId)
    await fetchTimeline()
  }

  const handleSkip = async (taskId: string) => {
    await onSkip?.(taskId)
    await fetchTimeline()
  }

  const handleAskHarvey = async (taskId: string, title: string, label: string) => {
    await onAskHarvey?.(taskId, title, label)
  }

  return (
    <section className="relative bg-[#FAF9F6] px-8 pb-12">
      <div className="absolute -top-20 right-0 w-[500px] h-[500px] bg-[#895af6]/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative max-w-5xl mx-auto pt-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <span className="material-symbols-outlined text-4xl text-[#895af6] animate-spin mb-4">
              progress_activity
            </span>
            <p className="text-slate-500">Loading your timeline...</p>
          </div>
        ) : !timelineData?.activeTask ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="material-symbols-outlined text-5xl text-slate-300 mb-4">
              task_alt
            </span>
            <p className="text-slate-500 text-base font-medium">
              No tasks scheduled. Ask Harvey to build your schedule.
            </p>
          </div>
        ) : (
          <>
            {(() => {
              const parts: Array<{ index: number; id: string; title: string; scheduled_start_time: string | Date | null }> = []
              if (timelineData.lastCompletedTask) {
                parts.push({
                  index: parts.length,
                  id: timelineData.lastCompletedTask.id,
                  title: timelineData.lastCompletedTask.title,
                  scheduled_start_time: timelineData.lastCompletedTask.completedAt,
                })
              }
              if (timelineData.activeTask) {
                parts.push({
                  index: parts.length,
                  id: timelineData.activeTask.id,
                  title: timelineData.activeTask.title,
                  scheduled_start_time: timelineData.activeTask.scheduledDate,
                })
              }
              timelineData.upcomingTasks.forEach((task) => {
                parts.push({
                  index: parts.length,
                  id: task.id,
                  title: task.title,
                  scheduled_start_time: task.scheduledDate,
                })
              })
              console.log('[TIMELINE] Render order:', JSON.stringify(parts))
              return null
            })()}
          <TimelineRail>
            {timelineData.lastCompletedTask && (
              <CompletedTaskCard
                title={timelineData.lastCompletedTask.title}
                completedAt={timelineData.lastCompletedTask.completedAt}
              />
            )}

            <ActiveTaskCard
              task={timelineData.activeTask}
              dependencies={timelineData.dependencies}
              dependentTasks={timelineData.dependentTasks}
              onComplete={handleComplete}
              onSkip={handleSkip}
              onAskHarvey={handleAskHarvey}
              onCriteriaChange={handleCriteriaChange}
            />

            {timelineData.upcomingTasks.map((task) => (
              <UpcomingTaskCard
                key={task.id}
                title={task.title}
                scheduledDate={task.scheduledDate}
              />
            ))}
          </TimelineRail>
          </>
        )}
      </div>

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium bg-slate-800 text-white"
          role="status"
        >
          {toast}
        </div>
      )}
    </section>
  )
}
