/**
 * Task Status Badge Component
 *
 * Displays a small colored indicator for task status.
 * Used in task cards to show visual status at a glance.
 *
 * Status colors:
 * - completed: Green
 * - urgent: Red
 * - focus: Purple
 * - pending: Gray
 * - in_progress: Purple
 * - skipped: Gray (lighter)
 */

'use client'

import type { TaskStatus } from '@/types/task.types'
import { STATUS_COLORS, getStatusLabel } from '@/types/task.types'

/**
 * Props for TaskStatusBadge component
 */
interface TaskStatusBadgeProps {
  /**
   * Current task status
   */
  status: TaskStatus

  /**
   * Size variant
   * - 'sm': Small dot (default)
   * - 'md': Medium dot with optional label
   * - 'lg': Large badge with label
   */
  size?: 'sm' | 'md' | 'lg'

  /**
   * Whether to show the status label text
   * Only applies to 'md' and 'lg' sizes
   */
  showLabel?: boolean

  /**
   * Additional CSS classes
   */
  className?: string
}

/**
 * TaskStatusBadge Component
 *
 * Renders a colored badge indicating task status.
 * Can be displayed as a simple dot or a full badge with label.
 *
 * @example
 * // Simple dot
 * <TaskStatusBadge status="urgent" />
 *
 * @example
 * // Badge with label
 * <TaskStatusBadge status="focus" size="lg" showLabel />
 */
export function TaskStatusBadge({
  status,
  size = 'sm',
  showLabel = false,
  className = '',
}: TaskStatusBadgeProps) {
  const colors = STATUS_COLORS[status]
  const label = getStatusLabel(status)

  // Size-based styling
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-3 h-3',
  }

  // Dot-only variant (sm or no label)
  if (size === 'sm' || !showLabel) {
    return (
      <span
        className={`inline-block rounded-full ${colors.bg} ${sizeClasses[size]} ${className}`}
        title={label}
        aria-label={`Status: ${label}`}
      />
    )
  }

  // Badge with label variant
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}
      style={{
        backgroundColor: `${colors.bg.replace('bg-', '')}20`, // Light background
      }}
    >
      <span className={`rounded-full ${colors.bg} ${sizeClasses[size]}`} />
      <span className={colors.text}>{label}</span>
    </span>
  )
}

/**
 * Status Dot Component
 *
 * A simpler version that just renders the colored dot.
 * Useful when you need the dot inline without badge wrapper.
 *
 * @example
 * <StatusDot status="completed" />
 */
export function StatusDot({
  status,
  className = '',
}: {
  status: TaskStatus
  className?: string
}) {
  const colors = STATUS_COLORS[status]
  const label = getStatusLabel(status)

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors.bg} ${className}`}
      title={label}
      aria-label={`Status: ${label}`}
    />
  )
}
