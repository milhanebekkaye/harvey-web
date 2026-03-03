/**
 * Task Details Component
 *
 * Displays expanded task information including:
 * - Full description
 * - Success criteria checklist
 * - Harvey's coaching tip
 * - Action buttons (Complete, Skip, Edit)
 *
 * Used in timeline view when a task is expanded.
 */

'use client'

import type { DashboardTask } from '@/types/task.types'
import { MarkdownMessage } from '@/components/ui/MarkdownMessage'
import { stripWrappingBold } from '@/lib/utils'
import { TaskChecklist } from './TaskChecklistItem'
import { TaskStatusBadge } from './TaskStatusBadge'

/**
 * Props for TaskDetails component
 */
interface TaskDetailsProps {
  /**
   * The task to display details for
   */
  task: DashboardTask

  /**
   * Callback when Complete button is clicked
   */
  onComplete?: (taskId: string) => void

  /**
   * Callback when Skip button is clicked
   */
  onSkip?: (taskId: string) => void

  /**
   * Callback when Edit button is clicked
   */
  onEdit?: (taskId: string) => void

  /**
   * Callback when a checklist item is toggled
   */
  onChecklistToggle?: (taskId: string, itemId: string, done: boolean) => void

  /**
   * Callback when "Ask Harvey" is clicked (opens/focuses task chat in sidebar)
   */
  onAskHarvey?: (taskId: string, title: string, label: string) => void

  /**
   * Whether action buttons are disabled (e.g., during API call)
   */
  isLoading?: boolean

  /**
   * Additional CSS classes
   */
  className?: string

  /**
   * Whether to show the header with title, label, and status
   * Set to false when used inside TaskTile which already shows these
   */
  showHeader?: boolean

  /**
   * All tasks (e.g. from List View state) to resolve dependency status for the skipped-dependency warning.
   * Optional; when not provided, the warning is not shown.
   */
  allTasks?: DashboardTask[]
}

/**
 * TaskDetails Component
 *
 * Renders the full details of a task in expanded view.
 * Includes description, checklist, Harvey tip, and actions.
 *
 * @example
 * <TaskDetails
 *   task={task}
 *   onComplete={(id) => handleComplete(id)}
 *   onSkip={(id) => handleSkip(id)}
 *   onEdit={(id) => handleEdit(id)}
 * />
 */
export function TaskDetails({
  task,
  onComplete,
  onSkip,
  onEdit,
  onChecklistToggle,
  onAskHarvey,
  isLoading = false,
  className = '',
  showHeader = false,
  allTasks = [],
}: TaskDetailsProps) {
  /**
   * Handle checklist item toggle
   */
  const handleChecklistToggle = (itemId: string, done: boolean) => {
    if (onChecklistToggle) {
      onChecklistToggle(task.id, itemId, done)
    }
  }

  // Check if task is already completed or skipped
  const isActionable = task.status !== 'completed' && task.status !== 'skipped'

  // Skipped dependencies: task IDs this task depends on that have status 'skipped' (from allTasks lookup)
  const skippedDependencies =
    task.dependsOn && allTasks.length > 0
      ? task.dependsOn
          .map((id) => allTasks.find((t) => t.id === id))
          .filter((t): t is DashboardTask => t != null && t.status === 'skipped')
      : []

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Optional Header */}
      {showHeader && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h3 className="font-semibold text-slate-800 text-lg">
              {task.title}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <TaskStatusBadge status={task.status} size="md" showLabel />
            </div>
          </div>
          <span className="text-sm font-medium text-slate-500">
            {task.duration}
          </span>
        </div>
      )}

      {/* Description */}
      {task.description && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Description
          </h4>
          <MarkdownMessage content={stripWrappingBold(task.description)} className="text-sm text-slate-600 leading-relaxed" />
        </div>
      )}

      {/* Success Criteria Checklist */}
      {task.checklist && task.checklist.length > 0 && (
        <TaskChecklist
          items={task.checklist}
          onToggle={isActionable ? handleChecklistToggle : undefined}
          disabled={!isActionable}
          title="Success Criteria"
        />
      )}

      {/* Harvey's Coaching Tip */}
      {task.harveyTip && (
        <div className="bg-[#895af6]/5 border border-[#895af6]/20 rounded-lg p-3">
          <div className="flex items-start gap-2">
            {/* Harvey Icon */}
            <div className="flex-shrink-0 w-5 h-5 bg-[#895af6] rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-xs">
                tips_and_updates
              </span>
            </div>
            {/* Tip Content */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#895af6] mb-0.5">
                Harvey&apos;s Tip
              </p>
              <p className="text-sm text-slate-600 leading-relaxed">
                {task.harveyTip}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Skipped dependency warning (List View only; no full Dependencies section) */}
      {skippedDependencies.length > 0 && (
        <div className="space-y-1.5">
          {skippedDependencies.map((dep) => (
            <p
              key={dep.id}
              className="text-sm text-red-500 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base shrink-0">
                warning
              </span>
              <span>
                Heads up — this task depends on &quot;{dep.title}&quot; which was
                skipped. Make sure you&apos;ve completed it before starting.
              </span>
            </p>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      {isActionable && (
        <div className="flex flex-wrap items-center gap-2 pt-3 mt-2 border-t border-slate-100">
          {/* Complete Button */}
          <button
            type="button"
            onClick={() => onComplete?.(task.id)}
            disabled={isLoading}
            className={`
              flex items-center gap-1.5 px-4 py-2
              bg-green-500 text-white text-sm font-semibold
              rounded-lg shadow-sm
              hover:bg-green-600 hover:shadow-md
              active:scale-95
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-150
            `}
          >
            <span className="material-symbols-outlined text-base">
              check_circle
            </span>
            Complete
          </button>

          {/* Skip Button */}
          <button
            type="button"
            onClick={() => onSkip?.(task.id)}
            disabled={isLoading}
            className={`
              flex items-center gap-1.5 px-4 py-2
              bg-slate-100 text-slate-600 text-sm font-semibold
              rounded-lg
              hover:bg-slate-200
              active:scale-95
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-150
            `}
          >
            <span className="material-symbols-outlined text-base">
              skip_next
            </span>
            Skip
          </button>

          {/* Ask Harvey Button — opens task chat in sidebar */}
          {onAskHarvey && (
            <button
              type="button"
              onClick={() => onAskHarvey(task.id, task.title, task.label)}
              className="
                flex items-center gap-1.5 px-3 py-2
                border border-[#8B5CF6] text-[#8B5CF6] text-sm font-medium
                rounded-lg bg-transparent
                hover:bg-[#8B5CF6]/10
                active:scale-95
                transition-all duration-150
              "
            >
              <span className="material-symbols-outlined text-base">chat</span>
              Ask Harvey
            </button>
          )}

          {/* Edit Button - pushed to right */}
          <button
            type="button"
            onClick={() => onEdit?.(task.id)}
            disabled={isLoading}
            className={`
              flex items-center gap-1.5 px-4 py-2 ml-auto
              bg-transparent text-slate-500 text-sm font-medium
              rounded-lg border border-slate-200
              hover:bg-slate-50 hover:border-slate-300
              active:scale-95
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-150
            `}
          >
            <span className="material-symbols-outlined text-base">
              edit
            </span>
            Edit
          </button>
        </div>
      )}

      {/* Completed: clear success state */}
      {task.status === 'completed' && (
        <div className="pt-3 mt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-green-50 text-green-700 border border-green-200">
            <span className="material-symbols-outlined text-base">check_circle</span>
            <span className="text-sm font-medium">Task completed</span>
          </div>
          {onAskHarvey && (
            <button
              type="button"
              onClick={() => onAskHarvey(task.id, task.title, task.label)}
              className="flex items-center gap-1.5 px-3 py-2 border border-[#8B5CF6] text-[#8B5CF6] text-sm font-medium rounded-lg bg-transparent hover:bg-[#8B5CF6]/10 transition-all"
            >
              <span className="material-symbols-outlined text-base">chat</span>
              Ask Harvey
            </button>
          )}
        </div>
      )}

      {/* Skipped: distinct “not done” state + option to complete later */}
      {task.status === 'skipped' && (
        <div className="pt-3 mt-2 border-t border-slate-100 space-y-3">
          <div className="flex flex-col gap-1 py-3 px-3 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">skip_next</span>
              <span className="text-sm font-semibold">This task was skipped</span>
            </div>
            <p className="text-xs text-amber-700 pl-7">
              You can still mark it complete if you do it later.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onAskHarvey && (
              <button
                type="button"
                onClick={() => onAskHarvey(task.id, task.title, task.label)}
                className="flex items-center gap-1.5 px-3 py-2 border border-[#8B5CF6] text-[#8B5CF6] text-sm font-medium rounded-lg bg-transparent hover:bg-[#8B5CF6]/10 transition-all"
              >
                <span className="material-symbols-outlined text-base">chat</span>
                Ask Harvey
              </button>
            )}
            <span className="text-xs text-slate-500">Finally completed?</span>
            <button
              type="button"
              onClick={() => onComplete?.(task.id)}
              disabled={isLoading}
              className={`
                flex items-center gap-1.5 px-4 py-2
                bg-green-500 text-white text-sm font-semibold
                rounded-lg shadow-sm
                hover:bg-green-600 hover:shadow-md
                active:scale-95
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-150
              `}
            >
              <span className="material-symbols-outlined text-base">check_circle</span>
              Complete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * TaskDetailsInline Component
 *
 * A variant designed to appear inline below a TaskTile.
 * Has adjusted padding and styling for seamless integration.
 */
export function TaskDetailsInline(props: TaskDetailsProps) {
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <TaskDetails {...props} />
    </div>
  )
}
