import { getCategoryIcon } from '@/components/dashboard/TaskCategoryBadge'
import type { ChecklistItem, TaskLabel } from '@/types/task.types'
import type { TimelineActiveTask, TimelineDependencyTask } from '@/types/timeline.types'
import { HarveysTip } from '@/components/timeline/HarveysTip'
import { SuccessCriteriaList } from '@/components/timeline/SuccessCriteriaList'

interface ActiveTaskCardProps {
  task: TimelineActiveTask
  dependencies: TimelineDependencyTask[]
  dependentTasks: TimelineDependencyTask[]
  onComplete: (taskId: string) => void | Promise<void>
  onSkip: (taskId: string) => void | Promise<void>
  onAskHarvey: (taskId: string, title: string, label: string) => void | Promise<void>
  onCriteriaChange: (criteria: ChecklistItem[]) => void | Promise<void>
}

function formatDueDate(scheduledDate: string | Date): string {
  const parsed = new Date(scheduledDate)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function getDependencyIcon(status: TimelineDependencyTask['status']): string {
  if (status === 'completed') {
    return 'check_circle'
  }

  if (status === 'skipped') {
    return 'cancel'
  }

  if (status === 'in_progress') {
    return 'play_circle'
  }

  return 'radio_button_unchecked'
}

function normalizeLabel(label: string): TaskLabel {
  if (label === 'Coding' ||
      label === 'Research' ||
      label === 'Design' ||
      label === 'Marketing' ||
      label === 'Communication' ||
      label === 'Personal' ||
      label === 'Planning') {
    return label
  }

  return 'Planning'
}

export function ActiveTaskCard({
  task,
  dependencies,
  dependentTasks,
  onComplete,
  onSkip,
  onAskHarvey,
  onCriteriaChange,
}: ActiveTaskCardProps) {
  const dueDate = formatDueDate(task.scheduledDate)
  const label = normalizeLabel(task.label)
  const icon = getCategoryIcon(label)

  return (
    <div className="relative mb-6">
      <div className="absolute left-[-36px] top-8 -translate-x-1/2 z-10">
        <div className="h-8 w-8 rounded-full bg-white border-2 border-[#895af6]/30 shadow-[0_0_0_6px_rgba(137,90,246,0.12)] flex items-center justify-center">
          <div className="h-3.5 w-3.5 rounded-full bg-[#895af6]" />
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-xl shadow-[#895af6]/5 border-2 border-[#895af6]/20 overflow-hidden ring-1 ring-[#895af6]/10 shadow-2xl shadow-[#895af6]/10 border-l-[6px] border-l-[#895af6]">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
          <div className="flex gap-4">
            <div className="bg-[#895af6]/10 p-3 rounded-lg text-[#895af6] h-fit">
              <span className="material-symbols-outlined text-2xl">{icon}</span>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold text-slate-900">{task.title}</h3>
                <span className="px-2.5 py-1 bg-[#895af6]/10 text-[#895af6] text-xs font-bold rounded-full uppercase tracking-wide">
                  Active
                </span>
                <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full uppercase tracking-wide">
                  {task.label}
                </span>
              </div>
              <p className="text-slate-500 text-sm mt-1">
                Due {dueDate} • Assigned to{' '}
                <span className="font-medium text-slate-700">You</span>
              </p>
            </div>
          </div>
          <button type="button" className="text-slate-400 hover:text-[#895af6] transition-colors">
            <span className="material-symbols-outlined">more_horiz</span>
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Description
            </h4>
            <p className="text-slate-700 text-sm leading-relaxed">{task.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2 sm:col-span-1">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Success Criteria
              </h4>
              <SuccessCriteriaList
                criteria={task.successCriteria}
                onChange={onCriteriaChange}
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Dependencies
              </h4>
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    This Task Depends On
                  </p>
                  {dependencies.length === 0 ? (
                    <p className="text-sm text-slate-500">No dependencies.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {dependencies.map((dependency) => (
                        <li key={dependency.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <span className="material-symbols-outlined text-[15px] text-slate-400">
                            {getDependencyIcon(dependency.status)}
                          </span>
                          <span>{dependency.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Tasks Depending On This
                  </p>
                  {dependentTasks.length === 0 ? (
                    <p className="text-sm text-slate-500">No downstream tasks yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {dependentTasks.map((dependent) => (
                        <li key={dependent.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <span className="material-symbols-outlined text-[15px] text-slate-400">
                            arrow_circle_down
                          </span>
                          <span>{dependent.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>

          <HarveysTip
            tip="..."
            isLoading={false}
            onRefresh={() => {
              // Placeholder for Step 4 API integration.
            }}
          />

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
              View Full Details
            </button>
            <button
              type="button"
              onClick={() => onAskHarvey(task.id, task.title, task.label)}
              className="px-4 py-2 bg-[#895af6]/10 text-[#895af6] hover:bg-[#895af6]/20 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">smart_toy</span>
              Ask Harvey
            </button>
            <button
              type="button"
              onClick={() => onSkip(task.id)}
              className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg transition-colors"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => onComplete(task.id)}
              className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg shadow-sm hover:opacity-90 transition-opacity"
            >
              Mark as Complete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
