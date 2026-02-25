'use client'

import { getCategoryIcon } from '@/components/dashboard/TaskCategoryBadge'
import type { TaskLabel } from '@/types/task.types'
import type { TimelineSkippedTask } from '@/types/timeline.types'

function formatTimeEstimate(
  scheduledDate: string | Date | null,
  scheduledStartTime: string | Date | null,
  scheduledEndTime: string | Date | null
): string {
  if (!scheduledDate) return '—'
  const d = new Date(scheduledDate)
  if (Number.isNaN(d.getTime())) return '—'
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (!scheduledStartTime && !scheduledEndTime) return dateStr
  const start = scheduledStartTime ? new Date(scheduledStartTime) : null
  const end = scheduledEndTime ? new Date(scheduledEndTime) : null
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    const t1 = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    const t2 = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    return `${dateStr} • ${t1} – ${t2}`
  }
  if (start && !Number.isNaN(start.getTime())) {
    return `${dateStr} • ${start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
  return dateStr
}

function normalizeLabel(label: string): TaskLabel {
  if (
    label === 'Coding' ||
    label === 'Research' ||
    label === 'Design' ||
    label === 'Marketing' ||
    label === 'Communication' ||
    label === 'Personal' ||
    label === 'Planning'
  ) {
    return label
  }
  return 'Planning'
}

interface SkippedTaskCardProps {
  task: TimelineSkippedTask
}

export function SkippedTaskCard({ task }: SkippedTaskCardProps) {
  const label = normalizeLabel(task.label)
  const icon = getCategoryIcon(label)
  const timeEstimate = formatTimeEstimate(
    task.scheduledDate,
    task.scheduledStartTime,
    task.scheduledEndTime
  )

  return (
    <div className="relative mb-6">
      <div className="absolute left-[-36px] top-6 -translate-x-1/2 z-10">
        <div className="h-7 w-7 rounded-full bg-white border-2 border-slate-200 shadow-sm flex items-center justify-center">
          <div className="h-2.5 w-2.5 bg-slate-400 rounded-full" />
        </div>
      </div>
      <div className="bg-white p-5 rounded-xl border border-slate-200 border-l-4 border-l-slate-400">
        <div className="flex justify-between items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="bg-slate-100 p-2 rounded-lg text-slate-500 shrink-0">
              <span className="material-symbols-outlined text-lg">{icon}</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-slate-700 font-medium truncate">{task.title}</h3>
              <p className="text-slate-500 text-sm mt-0.5">{timeEstimate}</p>
            </div>
          </div>
          <span className="px-2 py-1 bg-slate-200 text-slate-600 text-xs font-semibold rounded uppercase tracking-wide shrink-0">
            Skipped
          </span>
        </div>
        <div className="mt-2">
          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
            {task.label}
          </span>
        </div>
      </div>
    </div>
  )
}
