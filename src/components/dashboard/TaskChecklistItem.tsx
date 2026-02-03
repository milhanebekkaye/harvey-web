/**
 * Task Checklist Item Component
 *
 * Displays a single checklist item with checkbox functionality.
 * Used within task details to show success criteria as a checklist.
 *
 * Features:
 * - Checkbox toggle with visual feedback
 * - Strike-through text when completed
 * - Animated transitions
 * - Keyboard accessible
 */

'use client'

import type { ChecklistItem } from '@/types/task.types'

/**
 * Props for TaskChecklistItem component
 */
interface TaskChecklistItemProps {
  /**
   * The checklist item data
   */
  item: ChecklistItem

  /**
   * Callback when checkbox is toggled
   * Receives the item ID and new done state
   */
  onToggle?: (itemId: string, done: boolean) => void

  /**
   * Whether the checkbox is disabled (read-only mode)
   */
  disabled?: boolean

  /**
   * Additional CSS classes
   */
  className?: string
}

/**
 * TaskChecklistItem Component
 *
 * Renders a single checklist item with interactive checkbox.
 * Supports both controlled (with onToggle) and display-only modes.
 *
 * @example
 * // Interactive mode
 * <TaskChecklistItem
 *   item={{ id: '1', text: 'Complete design review', done: false }}
 *   onToggle={(id, done) => handleToggle(id, done)}
 * />
 *
 * @example
 * // Display-only mode
 * <TaskChecklistItem
 *   item={{ id: '1', text: 'Setup complete', done: true }}
 *   disabled
 * />
 */
export function TaskChecklistItem({
  item,
  onToggle,
  disabled = false,
  className = '',
}: TaskChecklistItemProps) {
  /**
   * Handle checkbox click
   * Calls onToggle callback with toggled state
   */
  const handleToggle = () => {
    if (!disabled && onToggle) {
      onToggle(item.id, !item.done)
    }
  }

  /**
   * Handle keyboard interaction
   * Supports Enter and Space for accessibility
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleToggle()
    }
  }

  return (
    <div
      className={`flex items-start gap-2 group ${className}`}
      role="listitem"
    >
      {/* Custom Checkbox */}
      <button
        type="button"
        role="checkbox"
        aria-checked={item.done}
        aria-label={`Mark "${item.text}" as ${item.done ? 'incomplete' : 'complete'}`}
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className={`
          flex-shrink-0 mt-0.5
          w-4 h-4 rounded border-2
          transition-all duration-200 ease-out
          flex items-center justify-center
          ${item.done
            ? 'bg-[#895af6] border-[#895af6]'
            : 'bg-white border-slate-300 hover:border-[#895af6]'
          }
          ${disabled ? 'cursor-default opacity-70' : 'cursor-pointer'}
          focus:outline-none focus:ring-2 focus:ring-[#895af6]/30 focus:ring-offset-1
        `}
      >
        {/* Checkmark Icon */}
        {item.done && (
          <svg
            className="w-2.5 h-2.5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </button>

      {/* Checklist Text */}
      <span
        className={`
          text-sm leading-relaxed
          transition-all duration-200
          ${item.done
            ? 'text-slate-400 line-through'
            : 'text-slate-700'
          }
        `}
      >
        {item.text}
      </span>
    </div>
  )
}

/**
 * Props for TaskChecklist component (container)
 */
interface TaskChecklistProps {
  /**
   * Array of checklist items
   */
  items: ChecklistItem[]

  /**
   * Callback when any item is toggled
   */
  onToggle?: (itemId: string, done: boolean) => void

  /**
   * Whether the entire checklist is disabled
   */
  disabled?: boolean

  /**
   * Additional CSS classes for the container
   */
  className?: string

  /**
   * Title to show above the checklist
   */
  title?: string
}

/**
 * TaskChecklist Component
 *
 * Container component that renders a list of TaskChecklistItems.
 * Handles the list semantics and optional title.
 *
 * @example
 * <TaskChecklist
 *   items={task.checklist}
 *   onToggle={handleToggle}
 *   title="Success Criteria"
 * />
 */
export function TaskChecklist({
  items,
  onToggle,
  disabled = false,
  className = '',
  title,
}: TaskChecklistProps) {
  // Don't render if no items
  if (!items || items.length === 0) {
    return null
  }

  // Calculate progress
  const completedCount = items.filter((item) => item.done).length
  const totalCount = items.length
  const progressPercent = Math.round((completedCount / totalCount) * 100)

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header with title and progress */}
      {title && (
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {title}
          </h4>
          <span className="text-xs text-slate-400">
            {completedCount}/{totalCount} ({progressPercent}%)
          </span>
        </div>
      )}

      {/* Checklist Items */}
      <div role="list" className="space-y-1.5">
        {items.map((item) => (
          <TaskChecklistItem
            key={item.id}
            item={item}
            onToggle={onToggle}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  )
}
