/**
 * Task Tile Component
 *
 * Displays a task as a compact card in the timeline view.
 * Shows title, duration, category badge, and status indicator.
 *
 * Features:
 * - Colored left border based on status
 * - Click to expand/select
 * - Hover effects
 * - Responsive design
 */

'use client'

import type { DashboardTask, TaskStatus } from '@/lib/types/task.types'
import { STATUS_COLORS } from '@/lib/types/task.types'

/**
 * Props for TaskTile component
 */
interface TaskTileProps {
  /**
   * The task to display
   */
  task: DashboardTask

  /**
   * Whether this task is currently expanded/selected
   */
  isExpanded?: boolean

  /**
   * Callback when task is clicked
   */
  onClick?: (taskId: string) => void

  /**
   * Additional CSS classes
   */
  className?: string

  /**
   * Variant for different display contexts
   * - 'default': Standard card with shadow
   * - 'compact': Smaller padding, no shadow
   * - 'calendar': Styled for calendar grid
   */
  variant?: 'default' | 'compact' | 'calendar'
}

/**
 * Get border color class based on status
 *
 * @param status - Task status
 * @returns Tailwind border-l class
 */
function getStatusBorderClass(status: TaskStatus): string {
  return STATUS_COLORS[status]?.border || 'border-l-slate-400'
}

/**
 * Get background color class based on status (for calendar view)
 *
 * @param status - Task status
 * @returns Tailwind bg class with opacity
 */
function getStatusBgClass(status: TaskStatus): string {
  const bgMap: Record<TaskStatus, string> = {
    completed: 'bg-green-50',
    urgent: 'bg-red-50',
    focus: 'bg-purple-50',
    pending: 'bg-slate-50',
    in_progress: 'bg-purple-50',
    skipped: 'bg-gray-50',
  }
  return bgMap[status] || 'bg-slate-50'
}

/**
 * Format decimal hour to readable time string
 *
 * @param decimalHour - Hour as decimal (e.g., 9.5 for 9:30)
 * @returns Formatted time string (e.g., "9:30 AM")
 */
function formatTime(decimalHour: number): string {
  const hours = Math.floor(decimalHour)
  const minutes = Math.round((decimalHour - hours) * 60)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours
  const displayMinutes = minutes.toString().padStart(2, '0')
  return `${displayHour}:${displayMinutes} ${period}`
}

/**
 * Format time range for display
 *
 * @param startTime - Start hour as decimal
 * @param endTime - End hour as decimal
 * @returns Formatted time range (e.g., "9:00 AM - 11:30 AM")
 */
function formatTimeRange(startTime: number, endTime: number): string {
  return `${formatTime(startTime)} - ${formatTime(endTime)}`
}

/**
 * TaskTile Component
 *
 * Renders a task as a clickable card with status indicator.
 * Used in timeline view for collapsed task display.
 *
 * @example
 * <TaskTile
 *   task={task}
 *   isExpanded={expandedId === task.id}
 *   onClick={(id) => setExpandedId(id)}
 * />
 */
export function TaskTile({
  task,
  isExpanded = false,
  onClick,
  className = '',
  variant = 'default',
}: TaskTileProps) {
  const borderClass = getStatusBorderClass(task.status)

  /**
   * Handle click event
   */
  const handleClick = () => {
    if (onClick) {
      onClick(task.id)
    }
  }

  /**
   * Handle keyboard interaction
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  // Variant-specific classes
  const variantClasses = {
    default: `
      p-4 bg-white rounded-xl shadow-sm
      border border-slate-100
      hover:shadow-md hover:border-slate-200
    `,
    compact: `
      p-3 bg-white rounded-lg
      border border-slate-100
      hover:bg-slate-50
    `,
    calendar: `
      p-2 rounded-lg
      ${getStatusBgClass(task.status)}
      hover:brightness-95
    `,
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`Task: ${task.title}, ${task.duration}, ${task.status}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`
        cursor-pointer
        border-l-4 ${borderClass}
        transition-all duration-200 ease-out
        ${variantClasses[variant]}
        ${isExpanded ? 'ring-2 ring-[#895af6]/30' : ''}
        ${className}
      `}
    >
      {/* Main Content */}
      <div className="flex items-center justify-between gap-3">
        {/* Left: Title and Time Range */}
        <div className="flex-1 min-w-0">
          {/* Task Title */}
          <h3
            className={`
              font-semibold text-slate-800 truncate
              ${variant === 'calendar' ? 'text-xs' : 'text-sm'}
            `}
          >
            {task.title}
          </h3>
          {/* Time Range (show for default and compact variants if times are set) */}
          {variant !== 'calendar' && task.startTime !== undefined && task.endTime !== undefined && (
            <p className="text-xs text-slate-400 mt-0.5">
              {formatTimeRange(task.startTime, task.endTime)}
            </p>
          )}
        </div>

        {/* Right: Duration and Expand Icon */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <span
            className={`
              font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded
              ${variant === 'calendar' ? 'text-[10px]' : 'text-xs'}
            `}
          >
            {task.duration}
          </span>
          {/* Expand Indicator */}
          {variant === 'default' && (
            <span
              className={`
                material-symbols-outlined text-slate-400 text-base
                transition-transform duration-200
                ${isExpanded ? 'rotate-180' : ''}
              `}
            >
              expand_more
            </span>
          )}
        </div>
      </div>

    </div>
  )
}

/**
 * TaskTileCompact Component
 *
 * A pre-configured compact variant of TaskTile.
 * Useful for denser layouts like "This Week" section.
 */
export function TaskTileCompact(props: Omit<TaskTileProps, 'variant'>) {
  return <TaskTile {...props} variant="compact" />
}

/**
 * TaskTileCalendar Component
 *
 * A pre-configured calendar variant of TaskTile.
 * Optimized for display in calendar grid cells.
 */
export function TaskTileCalendar(props: Omit<TaskTileProps, 'variant'>) {
  return <TaskTile {...props} variant="calendar" />
}
