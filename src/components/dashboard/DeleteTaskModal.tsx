/**
 * Delete Task Confirmation Modal
 *
 * Confirms task deletion. Shows dependent tasks warning when applicable.
 * Used from the timeline active task card three-dot menu.
 */

'use client'

import { useEffect, useRef, useCallback } from 'react'

export interface DeleteTaskModalDependent {
  id: string
  title: string
}

interface DeleteTaskModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  taskTitle: string
  dependentTasks: DeleteTaskModalDependent[]
  isDeleting: boolean
}

export function DeleteTaskModal({
  isOpen,
  onClose,
  onConfirm,
  taskTitle,
  dependentTasks,
  isDeleting,
}: DeleteTaskModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose()
      }
    },
    [onClose, isDeleting]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isDeleting) {
      onClose()
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-task-modal-title"
      onClick={handleBackdropClick}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div
        ref={modalRef}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4">
          <h2
            id="delete-task-modal-title"
            className="font-bold text-slate-900 text-lg"
          >
            Delete task?
          </h2>
          <p className="mt-3 text-slate-600 text-sm leading-relaxed">
            Are you sure you want to delete &quot;{taskTitle}&quot;? This action
            cannot be undone.
          </p>
          {dependentTasks.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-amber-800 text-sm font-medium">
                The following tasks depend on this task. Their dependency will be
                removed, but they will not be deleted:
              </p>
              <ul className="mt-2 list-disc list-inside text-amber-800 text-sm space-y-1">
                {dependentTasks.map((d) => (
                  <li key={d.id}>{d.title}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
