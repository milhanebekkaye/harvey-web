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

import type { DashboardTask } from '@/lib/types/task.types'
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
   * Whether action buttons are disabled (e.g., during API call)
   */
  isLoading?: boolean

  /**
   * Additional CSS classes
   */
  className?: string

  /**
   * Whether to show the header with title, category, and status
   * Set to false when used inside TaskTile which already shows these
   */
  showHeader?: boolean
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
  isLoading = false,
  className = '',
  showHeader = false,
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
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
            {task.description}
          </p>
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

      {/* Action Buttons */}
      {isActionable && (
        <div className="flex items-center gap-2 pt-3 mt-2 border-t border-slate-100">
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

      {/* Completed/Skipped Status Message */}
      {!isActionable && (
        <div className={`
          flex items-center gap-2 py-2 px-3 rounded-lg
          ${task.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}
        `}>
          <span className="material-symbols-outlined text-base">
            {task.status === 'completed' ? 'check_circle' : 'skip_next'}
          </span>
          <span className="text-sm font-medium">
            {task.status === 'completed' ? 'Task completed' : 'Task skipped'}
          </span>
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
