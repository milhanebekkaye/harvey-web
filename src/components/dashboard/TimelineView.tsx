/**
 * Timeline View Component
 *
 * Displays tasks grouped by date categories:
 * - OVERDUE: Tasks that are past their scheduled date (not completed/skipped)
 * - TODAY: Tasks scheduled for today
 * - TOMORROW: Tasks scheduled for tomorrow
 * - Individual days (WEDNESDAY, THURSDAY, etc.) for the rest of the week
 * - NEXT WEEK: Tasks scheduled for the following week
 * - LATER: Tasks scheduled more than 2 weeks out
 * - UNSCHEDULED: Tasks without a date
 *
 * Features:
 * - Task expansion on click (unified card expands vertically)
 * - Status updates (complete, skip)
 * - Empty state handling
 * - Loading state
 */

'use client'

import type { DashboardTask, TaskGroups } from '@/lib/types/task.types'
import { TaskTile } from './TaskTile'
import { TaskDetails } from './TaskDetails'

/**
 * Props for TimelineView component
 */
interface TimelineViewProps {
  /**
   * Tasks grouped by date category
   */
  tasks: TaskGroups | null

  /**
   * Currently expanded task ID
   */
  expandedTaskId: string | null

  /**
   * Callback when a task is clicked
   */
  onTaskClick: (taskId: string) => void

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
   * Whether task actions are loading
   */
  isActionLoading?: boolean

  /**
   * Whether tasks are loading
   */
  isLoading?: boolean
}

/**
 * TimelineView Component
 *
 * Renders tasks organized by TODAY, TOMORROW, THIS WEEK sections.
 * Handles task expansion inline with full details below.
 *
 * @example
 * <TimelineView
 *   tasks={taskGroups}
 *   expandedTaskId={expandedId}
 *   onTaskClick={(id) => setExpandedId(id)}
 *   onComplete={handleComplete}
 * />
 */
export function TimelineView({
  tasks,
  expandedTaskId,
  onTaskClick,
  onComplete,
  onSkip,
  onEdit,
  onChecklistToggle,
  isActionLoading = false,
  isLoading = false,
}: TimelineViewProps) {
  /**
   * Render a section of tasks
   *
   * @param title - Section title (TODAY, TOMORROW, etc.)
   * @param sectionTasks - Tasks for this section
   * @param gridLayout - Whether to use 2-column grid (for THIS WEEK)
   * @param isOverdue - Whether this is the overdue section (red styling)
   */
  const renderTaskSection = (
    title: string,
    sectionTasks: DashboardTask[],
    gridLayout = false,
    isOverdue = false
  ) => {
    // Don't render empty sections
    if (sectionTasks.length === 0) {
      return null
    }

    return (
      <section key={title}>
        {/* Section Header */}
        <div className="flex items-center gap-3 py-6 mt-4 first:mt-0">
          <h2
            className={`text-sm font-black tracking-[0.15em] uppercase ${
              isOverdue ? 'text-red-500' : 'text-slate-400'
            }`}
          >
            {title}
          </h2>
          <div className={`h-[1px] flex-1 ${isOverdue ? 'bg-red-200' : 'bg-slate-200'}`}></div>
          <span className={`text-xs font-medium ${isOverdue ? 'text-red-400' : 'text-slate-400'}`}>
            {sectionTasks.length} task{sectionTasks.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Task List */}
        <div className={gridLayout ? 'grid grid-cols-2 gap-4' : 'space-y-3'}>
          {sectionTasks.map((task) => {
            const isExpanded = expandedTaskId === task.id

            return (
              <div
                key={task.id}
                className={`
                  rounded-xl overflow-hidden
                  transition-all duration-300 ease-out
                  ${isExpanded
                    ? 'bg-white shadow-xl border border-[#895af6]/30 scale-[1.01]'
                    : 'hover:scale-[1.005]'
                  }
                  ${isOverdue && !isExpanded ? 'ring-2 ring-red-200' : ''}
                `}
              >
                {/* Task Card - Unified container when expanded */}
                <TaskTile
                  task={task}
                  isExpanded={isExpanded}
                  onClick={onTaskClick}
                  variant={gridLayout ? 'compact' : 'default'}
                  className={isExpanded ? 'border-0 shadow-none rounded-b-none bg-gradient-to-r from-white to-slate-50/50' : ''}
                />

                {/* Expanded Details (inline, part of unified card) */}
                {isExpanded && !gridLayout && (
                  <div
                    className="px-5 pb-5 pt-4 bg-gradient-to-b from-slate-50/50 to-white animate-in slide-in-from-top-2 duration-200"
                  >
                    <TaskDetails
                      task={task}
                      onComplete={onComplete}
                      onSkip={onSkip}
                      onEdit={onEdit}
                      onChecklistToggle={onChecklistToggle}
                      isLoading={isActionLoading}
                      showHeader={false}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  // Loading State
  if (isLoading) {
    return (
      <div className="px-8 pb-12">
        <div className="flex flex-col items-center justify-center py-16">
          <span className="material-symbols-outlined text-4xl text-[#895af6] animate-spin mb-4">
            progress_activity
          </span>
          <p className="text-slate-500">Loading your tasks...</p>
        </div>
      </div>
    )
  }

  // No tasks state
  if (!tasks) {
    return (
      <div className="px-8 pb-12">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="material-symbols-outlined text-5xl text-slate-300 mb-4">
            task_alt
          </span>
          <h3 className="text-lg font-semibold text-slate-600 mb-2">No tasks yet</h3>
          <p className="text-sm text-slate-400 max-w-sm">
            Complete the onboarding to generate your personalized task schedule.
          </p>
        </div>
      </div>
    )
  }

  // Check if all sections are empty
  const hasAnyTasks =
    tasks.overdue.length > 0 ||
    tasks.today.length > 0 ||
    tasks.tomorrow.length > 0 ||
    tasks.weekDays.some((day) => day.tasks.length > 0) ||
    tasks.nextWeek.length > 0 ||
    tasks.later.length > 0 ||
    tasks.unscheduled.length > 0

  if (!hasAnyTasks) {
    return (
      <div className="px-8 pb-12">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="material-symbols-outlined text-5xl text-green-400 mb-4">
            celebration
          </span>
          <h3 className="text-lg font-semibold text-slate-600 mb-2">All caught up!</h3>
          <p className="text-sm text-slate-400 max-w-sm">
            You&apos;ve completed all your tasks. Great work!
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-8 pb-12">
      {renderTaskSection('Overdue', tasks.overdue, false, true)}
      {renderTaskSection('Today', tasks.today)}
      {renderTaskSection('Tomorrow', tasks.tomorrow)}
      {/* Individual days for the rest of this week */}
      {tasks.weekDays.map((daySection) =>
        renderTaskSection(daySection.label, daySection.tasks)
      )}
      {renderTaskSection('Next Week', tasks.nextWeek)}
      {renderTaskSection('Later', tasks.later)}
      {tasks.unscheduled.length > 0 && renderTaskSection('Unscheduled', tasks.unscheduled)}
    </div>
  )
}
