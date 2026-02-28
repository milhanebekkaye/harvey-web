/**
 * Task Tile Component
 *
 * Displays a task as a compact card in the timeline view.
 * Shows title, duration, label badge, and status indicator.
 *
 * Features:
 * - Colored left border based on status
 * - Click to expand/select
 * - Hover effects
 * - Responsive design
 */

'use client'

import type { DashboardTask, TaskStatus } from '@/types/task.types'
import { STATUS_COLORS } from '@/types/task.types'
import { GripVertical } from 'lucide-react'
import { TaskLabelBadge } from './TaskCategoryBadge'

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

  /**
   * Whether this task's chat is currently active in the sidebar (shows subtle purple glow).
   * Badge and ring are rendered by the parent wrapper; this prop is for tile-level styling if needed.
   */
  isActiveConversation?: boolean

  /**
   * Optional props for the drag handle (from dnd-kit useSortable). When provided, only the handle triggers drag.
   * Deprecated in list view: use showDragHandle instead and apply listeners on the card wrapper.
   */
  dragHandleProps?: Record<string, unknown>

  /**
   * When true in default variant, show GripVertical as a visual hint that the card is draggable.
   * Used when the whole card is the drag target (listeners on parent); grip is decorative only.
   */
  showDragHandle?: boolean

  /**
   * When true, the card is being dragged; applies reduced opacity.
   */
  isDragging?: boolean
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
 * Handles overnight times (hours >= 24) by wrapping to 0-23 range.
 * Example: 26.0 (2 AM next day) displays as "2:00 AM"
 *
 * @param decimalHour - Hour as decimal (e.g., 9.5 for 9:30, 26.0 for 2:00 AM next day)
 * @returns Formatted time string (e.g., "9:30 AM", "2:00 AM")
 */
function formatTime(decimalHour: number): string {
  // Wrap hours >= 24 to 0-23 range for overnight tasks
  const normalizedHour = decimalHour >= 24 ? decimalHour - 24 : decimalHour
  
  const hours = Math.floor(normalizedHour)
  const minutes = Math.round((normalizedHour - hours) * 60)
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
 * Human-readable label for a flexible window from boundary times.
 */
function getFlexibleWindowLabel(windowStart?: string, windowEnd?: string): string {
  if (!windowStart || !windowEnd) return 'During the day'
  return 'During the day'
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
  isActiveConversation = false,
  dragHandleProps,
  showDragHandle = false,
  isDragging = false,
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
        ${isDragging ? 'opacity-50' : ''}
        ${className}
      `}
    >
      {/* Main Content */}
      <div className="flex items-center justify-between gap-3">
        {/* Drag handle (default variant): with dragHandleProps it's the drag trigger; with showDragHandle only it's decorative */}
        {variant === 'default' && (dragHandleProps || showDragHandle) && (
          dragHandleProps ? (
            <button
              type="button"
              className="flex-shrink-0 p-1 -ml-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 touch-none cursor-grab active:cursor-grabbing"
              aria-label="Drag to reorder"
              onClick={(e) => e.stopPropagation()}
              {...dragHandleProps}
            >
              <GripVertical className="w-4 h-4" />
            </button>
          ) : (
            <span
              className="flex-shrink-0 p-1 -ml-1 rounded text-slate-400 flex items-center"
              aria-hidden
            >
              <GripVertical className="w-4 h-4" />
            </span>
          )
        )}
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
          {/* Time Range (show for default and compact variants when we have time info) */}
          {variant !== 'calendar' && (() => {
            const timeLabel = task.isFlexible
              ? `${getFlexibleWindowLabel(task.windowStart, task.windowEnd)} · ${task.duration}`
              : task.startTime !== undefined && task.endTime !== undefined
                ? formatTimeRange(task.startTime, task.endTime)
                : null
            return timeLabel != null ? <p className="text-xs text-slate-400 mt-0.5">{timeLabel}</p> : null
          })()}
        </div>

        {/* Right: Label, Duration, and Expand Icon */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <TaskLabelBadge label={task.label} size={variant === 'calendar' ? 'sm' : 'md'} />
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
