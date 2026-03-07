/**
 * Task Label Badge Component
 *
 * Displays a colored badge showing the task's label.
 * Labels help users visually group related tasks.
 *
 * Available labels:
 * - Coding (blue)
 * - Research (green)
 * - Design (purple)
 * - Marketing (orange)
 * - Communication (yellow)
 * - Personal (gray)
 * - Planning (pink)
 */

'use client'

import type { LucideIcon } from 'lucide-react'
import { Calendar, Code, FlaskConical, Megaphone, MessagesSquare, Palette, User } from 'lucide-react'
import type { TaskLabel } from '@/types/task.types'
import { TASK_LABEL_COLORS } from '@/types/task.types'

/**
 * Props for TaskLabelBadge component
 */
interface TaskLabelBadgeProps {
  /**
   * Task label
   */
  label: TaskLabel

  /**
   * Size variant
   * - 'sm': Smaller text and padding
   * - 'md': Default size
   */
  size?: 'sm' | 'md'

  /**
   * Additional CSS classes
   */
  className?: string
}

/**
 * TaskLabelBadge Component
 *
 * Renders a colored pill badge with the label name.
 * Color is determined by the label type.
 *
 * @example
 * <TaskCategoryBadge label="Coding" />
 *
 * @example
 * <TaskCategoryBadge label="Research" size="sm" />
 */
export function TaskCategoryBadge({
  label,
  size = 'md',
  className = '',
}: TaskLabelBadgeProps) {
  // Get colors for this label, fallback to Planning if not found
  const colors = TASK_LABEL_COLORS[label] || TASK_LABEL_COLORS.Planning

  // Size-based classes
  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${colors.bg} ${colors.text} ${sizeClasses[size]} ${className}`}
    >
      {label}
    </span>
  )
}

/**
 * Label Icon Component
 *
 * Returns a Lucide icon component for each label.
 * Useful when you need icons alongside or instead of text.
 *
 * @param label - Task label
 * @returns Lucide icon component
 */
export function getCategoryIcon(label: TaskLabel): LucideIcon {
  const icons: Record<TaskLabel, LucideIcon> = {
    Coding: Code,
    Research: FlaskConical,
    Design: Palette,
    Marketing: Megaphone,
    Communication: MessagesSquare,
    Personal: User,
    Planning: Calendar,
  }
  return icons[label]
}

/**
 * CategoryBadgeWithIcon Component
 *
 * A variant that includes an icon before the label name.
 *
 * @example
 * <CategoryBadgeWithIcon label="Coding" />
 */
export function CategoryBadgeWithIcon({
  label,
  size = 'md',
  className = '',
}: TaskLabelBadgeProps) {
  const colors = TASK_LABEL_COLORS[label] || TASK_LABEL_COLORS.Planning
  const icon = getCategoryIcon(label)

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
  }

  const Icon = icon
  const iconSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${colors.bg} ${colors.text} ${sizeClasses[size]} ${className}`}
    >
      <Icon className={iconSizeClasses[size]} />
      {label}
    </span>
  )
}

/**
 * Backward-compatible alias (deprecated).
 *
 * Prefer TaskLabelBadge moving forward.
 */
export const TaskLabelBadge = TaskCategoryBadge
