/**
 * Task Category Badge Component
 *
 * Displays a colored badge showing the task's category.
 * Categories help users visually group related tasks.
 *
 * Available categories:
 * - Management (blue)
 * - Research (purple)
 * - Team (green)
 * - Design (pink)
 * - Marketing (orange)
 * - Development (indigo)
 * - Testing (yellow)
 * - Documentation (slate)
 * - Other (gray)
 */

'use client'

import type { TaskCategory } from '@/types/task.types'
import { CATEGORY_COLORS } from '@/types/task.types'

/**
 * Props for TaskCategoryBadge component
 */
interface TaskCategoryBadgeProps {
  /**
   * Task category
   */
  category: TaskCategory

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
 * TaskCategoryBadge Component
 *
 * Renders a colored pill badge with the category name.
 * Color is determined by the category type.
 *
 * @example
 * <TaskCategoryBadge category="Management" />
 *
 * @example
 * <TaskCategoryBadge category="Development" size="sm" />
 */
export function TaskCategoryBadge({
  category,
  size = 'md',
  className = '',
}: TaskCategoryBadgeProps) {
  // Get colors for this category, fallback to "Other" if not found
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other

  // Size-based classes
  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${colors.bg} ${colors.text} ${sizeClasses[size]} ${className}`}
    >
      {category}
    </span>
  )
}

/**
 * Category Icon Component
 *
 * Returns a Material Symbol icon name for each category.
 * Useful when you need icons alongside or instead of text.
 *
 * @param category - Task category
 * @returns Material Symbol icon name
 */
export function getCategoryIcon(category: TaskCategory): string {
  const icons: Record<TaskCategory, string> = {
    Management: 'folder_managed',
    Research: 'science',
    Team: 'group',
    Design: 'palette',
    Marketing: 'campaign',
    Development: 'code',
    Testing: 'bug_report',
    Documentation: 'description',
    Other: 'more_horiz',
  }
  return icons[category]
}

/**
 * CategoryBadgeWithIcon Component
 *
 * A variant that includes an icon before the category name.
 *
 * @example
 * <CategoryBadgeWithIcon category="Development" />
 */
export function CategoryBadgeWithIcon({
  category,
  size = 'md',
  className = '',
}: TaskCategoryBadgeProps) {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other
  const icon = getCategoryIcon(category)

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
  }

  const iconSizeClasses = {
    sm: 'text-[10px]',
    md: 'text-xs',
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${colors.bg} ${colors.text} ${sizeClasses[size]} ${className}`}
    >
      <span className={`material-symbols-outlined ${iconSizeClasses[size]}`}>{icon}</span>
      {category}
    </span>
  )
}
