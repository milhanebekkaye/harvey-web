/**
 * Task Modal Component
 *
 * Modal dialog for displaying task details in calendar view.
 * Opens when user clicks on a task in the calendar grid.
 *
 * Features:
 * - Backdrop blur overlay
 * - Slide-in animation
 * - Close on Escape key or backdrop click
 * - Full task details with actions
 * - Focus trap for accessibility
 */

'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { DashboardTask } from '@/types/task.types'
import { TaskDetails } from './TaskDetails'
import { TaskLabelBadge } from './TaskCategoryBadge'
import { TaskStatusBadge } from './TaskStatusBadge'

/**
 * Props for TaskModal component
 */
interface TaskModalProps {
  /**
   * The task to display (null = modal closed)
   */
  task: DashboardTask | null

  /**
   * Whether the modal is open
   */
  isOpen: boolean

  /**
   * Callback to close the modal
   */
  onClose: () => void

  /**
   * Callback when Complete button is clicked
   */
  onComplete?: (taskId: string) => void

  /**
   * Callback when Skip button is clicked
   */
  onSkip?: (taskId: string) => void

  /**
   * Callback when a checklist item is toggled
   */
  onChecklistToggle?: (taskId: string, itemId: string, done: boolean) => void

  /**
   * Whether action buttons are disabled
   */
  isLoading?: boolean
}

/**
 * TaskModal Component
 *
 * Renders a modal dialog with full task details.
 * Used in calendar view when clicking on a task block.
 *
 * @example
 * <TaskModal
 *   task={selectedTask}
 *   isOpen={isModalOpen}
 *   onClose={() => setIsModalOpen(false)}
 *   onComplete={handleComplete}
 * />
 */
export function TaskModal({
  task,
  isOpen,
  onClose,
  onComplete,
  onSkip,
  onChecklistToggle,
  isLoading = false,
}: TaskModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  /**
   * Handle Escape key press
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  /**
   * Handle backdrop click
   */
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  /**
   * Setup event listeners and focus management
   */
  useEffect(() => {
    if (isOpen) {
      // Store current focus
      previousActiveElement.current = document.activeElement as HTMLElement

      // Add escape listener
      document.addEventListener('keydown', handleKeyDown)

      // Focus modal
      modalRef.current?.focus()

      // Prevent body scroll
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''

      // Restore focus
      if (previousActiveElement.current) {
        previousActiveElement.current.focus()
      }
    }
  }, [isOpen, handleKeyDown])

  // Don't render if not open or no task
  if (!isOpen || !task) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-modal-title"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />

      {/* Modal Content */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`
          relative w-full max-w-lg max-h-[85vh]
          bg-white rounded-2xl shadow-2xl
          overflow-hidden
          animate-slide-up
          focus:outline-none
        `}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 z-10">
          <div className="flex items-start justify-between gap-4">
            {/* Title and Badges */}
            <div className="flex-1 min-w-0">
              <h2
                id="task-modal-title"
                className="font-bold text-slate-900 text-lg leading-tight"
              >
                {task.title}
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <TaskLabelBadge label={task.label} />
                <TaskStatusBadge status={task.status} size="md" showLabel />
                <span className="text-sm text-slate-500 ml-1">
                  {task.duration}
                </span>
              </div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className={`
                flex-shrink-0 p-1.5
                text-slate-400 hover:text-slate-600
                rounded-lg hover:bg-slate-100
                transition-colors duration-150
              `}
              aria-label="Close modal"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        {/* Body - Scrollable */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(85vh-120px)]">
          <TaskDetails
            task={task}
            onComplete={onComplete}
            onSkip={onSkip}
            onChecklistToggle={onChecklistToggle}
            isLoading={isLoading}
            showHeader={false}
          />
        </div>

        {/* Footer with Schedule Info */}
        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-100 px-6 py-3">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">
                calendar_today
              </span>
              <span>{task.day}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">
                schedule
              </span>
              <span>
                {task.isFlexible
                  ? `${getFlexibleWindowLabel(task.windowStart, task.windowEnd)} · ${task.duration}`
                  : `${formatTime(task.startTime)} - ${formatTime(task.endTime)}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Keyframe Animations */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.2s ease-out forwards;
        }

        .animate-slide-up {
          animation: slide-up 0.25s ease-out forwards;
        }
      `}</style>
    </div>
  )
}

/**
 * Human-readable label for a flexible window.
 */
function getFlexibleWindowLabel(windowStart?: string, windowEnd?: string): string {
  if (!windowStart || !windowEnd) return 'During the day'
  return 'During the day'
}

/**
 * Format decimal hour to readable time string
 *
 * @param hour - Hour as decimal (e.g., 9.5 = 9:30 AM)
 * @returns Formatted time string (e.g., "9:30 AM")
 */
function formatTime(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)

  const period = h >= 12 ? 'PM' : 'AM'
  const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h
  const displayMinutes = m.toString().padStart(2, '0')

  return `${displayHour}:${displayMinutes} ${period}`
}
