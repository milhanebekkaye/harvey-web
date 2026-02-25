/**
 * Timeline View Component
 *
 * Displays tasks grouped by date categories (top to bottom):
 * - OVERDUE: Tasks past their scheduled date (pending/skipped)
 * - TODAY: Tasks scheduled for today
 * - TOMORROW: Tasks scheduled for tomorrow
 * - Individual days (MONDAY, TUESDAY, etc.) for the next 2–6 days (rolling 7-day window)
 * - LATER: More than 7 days out
 * - UNSCHEDULED
 * - PAST: Completed tasks from previous days (collapsible, at end)
 *
 * Features:
 * - "Show past tasks (N)" toggle at top with smooth expand/collapse
 * - Task expansion on click (unified card expands vertically)
 * - Status updates (complete, skip)
 * - Empty state handling
 * - Loading state
 */

'use client'

import { useMemo, useState } from 'react'
import type { DashboardTask, TaskGroups } from '@/types/task.types'
import { TaskTile } from './TaskTile'
import { TaskDetails } from './TaskDetails'

function flattenTasks(tasks: TaskGroups | null): DashboardTask[] {
  if (!tasks) return []
  return [
    ...tasks.past,
    ...tasks.overdue,
    ...tasks.today,
    ...tasks.tomorrow,
    ...tasks.weekDays.flatMap((d) => d.tasks),
    ...tasks.later,
    ...tasks.unscheduled,
  ]
}

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

  /**
   * Task id whose chat is currently active in the sidebar; card gets purple glow + chat badge
   */
  activeConversationTaskId?: string | null

  /**
   * Callback when "Ask Harvey" is clicked on a task (opens/focuses task chat)
   */
  onAskHarvey?: (taskId: string, title: string, label: string) => void
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
  activeConversationTaskId = null,
  onAskHarvey,
}: TimelineViewProps) {
  const [showPast, setShowPast] = useState(false)
  const allTasks = useMemo(() => flattenTasks(tasks), [tasks])

  /**
   * Render a section of tasks
   *
   * @param title - Section title (TODAY, TOMORROW, etc.)
   * @param sectionTasks - Tasks for this section
   * @param gridLayout - Whether to use 2-column grid (for THIS WEEK)
   * @param isOverdue - Whether this is the overdue section (red styling)
   * @param isPast - Whether this is the past section (reduced opacity)
   */
  const renderTaskSection = (
    title: string,
    sectionTasks: DashboardTask[],
    gridLayout = false,
    isOverdue = false,
    isPast = false
  ) => {
    if (sectionTasks.length === 0) {
      return null
    }

    return (
      <section key={title}>
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

        <div className={gridLayout ? 'grid grid-cols-2 gap-4' : 'space-y-3'}>
          {sectionTasks.map((task) => {
            const isExpanded = expandedTaskId === task.id
            const isActiveConversation = activeConversationTaskId === task.id

            return (
              <div
                key={task.id}
                className={`
                  rounded-xl overflow-hidden relative
                  transition-all duration-300 ease-out
                  ${isPast && !isExpanded ? 'opacity-60' : ''}
                  ${isExpanded
                    ? 'bg-white shadow-xl border border-[#895af6]/30 scale-[1.01]'
                    : 'hover:scale-[1.005]'
                  }
                  ${isOverdue && !isExpanded ? 'ring-2 ring-red-200' : ''}
                  ${isActiveConversation ? 'ring-2 ring-[#8B5CF6]/30 shadow-[0_0_0_2px_rgba(139,92,246,0.3)]' : ''}
                `}
              >
                {isActiveConversation && (
                  <div
                    className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-[#8B5CF6] text-white flex items-center justify-center"
                    title="Task chat open"
                  >
                    <span className="material-symbols-outlined text-sm">
                      chat
                    </span>
                  </div>
                )}
                <TaskTile
                  task={task}
                  isExpanded={isExpanded}
                  onClick={onTaskClick}
                  variant={gridLayout ? 'compact' : 'default'}
                  className={isExpanded ? 'border-0 shadow-none rounded-b-none bg-gradient-to-r from-white to-slate-50/50' : ''}
                  isActiveConversation={isActiveConversation}
                />

                {/* Task detail uses same task from list — no extra fetch on expand */}
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
                      onAskHarvey={onAskHarvey}
                      isLoading={isActionLoading}
                      showHeader={false}
                      allTasks={allTasks}
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

  const hasAnyTasks =
    tasks.past.length > 0 ||
    tasks.overdue.length > 0 ||
    tasks.today.length > 0 ||
    tasks.tomorrow.length > 0 ||
    tasks.weekDays.some((day) => day.tasks.length > 0) ||
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

  const pastCount = tasks.past.length

  return (
    <div className="px-8 pb-12">
      {/* Show past tasks toggle – subtle button at top */}
      {pastCount > 0 && (
        <button
          type="button"
          onClick={() => setShowPast((v) => !v)}
          className="flex items-center gap-2 w-full py-3 text-left text-sm text-slate-500 hover:text-slate-700 transition-colors border-b border-slate-100 mb-1"
          aria-expanded={showPast}
        >
          <span className="text-slate-400 select-none" aria-hidden>
            {showPast ? '↓' : '↑'}
          </span>
          <span>
            {showPast ? 'Hide past tasks' : 'Show past tasks'}
          </span>
          <span className="text-slate-400 font-medium">({pastCount})</span>
        </button>
      )}

      {renderTaskSection('Overdue', tasks.overdue, false, true)}
      {renderTaskSection('Today', tasks.today)}
      {renderTaskSection('Tomorrow', tasks.tomorrow)}
      {tasks.weekDays.map((daySection) =>
        renderTaskSection(daySection.label, daySection.tasks)
      )}
      {renderTaskSection('Later', tasks.later)}
      {tasks.unscheduled.length > 0 && renderTaskSection('Unscheduled', tasks.unscheduled)}

      {/* Past section – collapsible, at end */}
      {pastCount > 0 && (
        <div
          className="overflow-hidden transition-[max-height] duration-300 ease-out"
          style={{ maxHeight: showPast ? '5000px' : '0' }}
          aria-hidden={!showPast}
        >
          {renderTaskSection('Past', tasks.past, false, false, true)}
        </div>
      )}
    </div>
  )
}
