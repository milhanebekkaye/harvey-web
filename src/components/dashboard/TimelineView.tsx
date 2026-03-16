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
 * - Drag-and-drop reorder (same day and cross-day) when onReorder + availableWindows + allTasks provided
 * - Empty state handling
 * - Loading state
 */

'use client'

import {
  CheckSquare,
  Loader2,
  MessageCircle,
  PartyPopper,
} from 'lucide-react'
import React, { useMemo, useState, useCallback, useEffect } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { DashboardTask, TaskGroups } from '@/types/task.types'
import type { TimeBlock } from '@/types/api.types'
import { TaskTile } from './TaskTile'
import { TaskDetails } from './TaskDetails'
import { DeleteTaskModal } from './DeleteTaskModal'

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

/** YYYY-MM-DD to lowercase day name for availability lookup */
function dateStrToDayName(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return days[d.getUTCDay()]
}

/** Get availability window for a day from project's available_time. Fallback 09:00–23:59 */
function getWindowForDay(
  availableWindows: TimeBlock[],
  dateStr: string
): { windowStart: string; windowEnd: string } {
  const day = dateStrToDayName(dateStr)
  const blocks = availableWindows.filter((b) => b.day.toLowerCase() === day)
  if (blocks.length === 0) return { windowStart: '09:00', windowEnd: '23:59' }
  const parse = (s: string) => {
    const [h, m] = s.split(':').map(Number)
    return (Number.isNaN(h) ? 9 : h) + (Number.isNaN(m) ? 0 : m) / 60
  }
  let minStart = 24
  let maxEnd = 0
  for (const b of blocks) {
    const start = parse(b.start)
    const end = parse(b.end)
    if (end <= start) continue
    if (start < minStart) minStart = start
    if (end > maxEnd) maxEnd = end
  }
  const fmt = (h: number) => `${Math.floor(h).toString().padStart(2, '0')}:${Math.round((h % 1) * 60).toString().padStart(2, '0')}`
  return {
    windowStart: minStart >= 24 ? '09:00' : fmt(minStart),
    windowEnd: maxEnd <= 0 ? '23:59' : fmt(maxEnd),
  }
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
   * Callback when a task is clicked (null = clear selection, e.g. after delete)
   */
  onTaskClick: (taskId: string | null) => void

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

  /**
   * Callback after a task is deleted (so parent can refresh list). Used with delete button in task detail.
   */
  onTaskDeleted?: (taskId: string) => void

  /**
   * Callback when task order changes after drag-and-drop. When provided with availableWindows and allTasks, drag handle is shown and reorder is enabled.
   */
  onReorder?: (
    taskId: string,
    newDate: string,
    isFlexible: boolean,
    windowStart: string | null,
    windowEnd: string | null,
    destinationSiblingsOrder: string[],
    sourceSiblingsOrder: string[]
  ) => Promise<void>

  /**
   * Availability windows from user.availabilityWindows (via API)
   */
  availableWindows?: TimeBlock[]

  /**
   * Flat list of all tasks (for dependency checking and lookup)
   */
  allTasks?: DashboardTask[]
}

function canDragTask(task: DashboardTask): boolean {
  return task.status === 'pending' || task.status === 'focus' || task.status === 'urgent' || task.status === 'in_progress'
}

/**
 * Droppable section container — registers empty space below tasks as a valid
 * drop target so closestCenter doesn't fall back to the last task of the
 * preceding section when the pointer is below all tasks in a day group.
 *
 * The `id` should be the YYYY-MM-DD date string of that section so
 * handleDragEnd can identify which day the user is targeting.
 */
function DroppableSection({
  id,
  children,
  className = '',
}: {
  id: string
  children: React.ReactNode
  className?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`${className}${isOver ? ' rounded-lg ring-2 ring-purple-200' : ''}`}
      style={{ minHeight: '60px' }}
    >
      {children}
    </div>
  )
}

interface SortableTaskItemProps {
  task: DashboardTask
  sectionDateStr: string | null
  isExpanded: boolean
  onTaskClick: (taskId: string | null) => void
  variant: 'default' | 'compact'
  gridLayout: boolean
  isOverdue: boolean
  isPast: boolean
  isActiveConversation: boolean
  onComplete?: (taskId: string) => void
  onSkip?: (taskId: string) => void
  onChecklistToggle?: (taskId: string, itemId: string, done: boolean) => void
  onAskHarvey?: (taskId: string, title: string, label: string) => void
  onDelete?: (taskId: string) => void
  isActionLoading?: boolean
  allTasks: DashboardTask[]
}

function SortableTaskItem(props: SortableTaskItemProps) {
  const { task, ...rest } = props
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !canDragTask(task) })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? 'transform 200ms ease',
    ...(isDragging ? { opacity: 0 } : {}),
  }

  const canDrag = canDragTask(task)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
      className={`
        rounded-xl overflow-hidden relative
        transition-all duration-300 ease-out
        ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}
        ${rest.isPast && !rest.isExpanded ? 'opacity-60' : ''}
        ${rest.isExpanded
          ? 'bg-white shadow-xl border border-[#895af6]/30 scale-[1.01]'
          : 'hover:scale-[1.005]'
        }
        ${rest.isOverdue && !rest.isExpanded ? 'ring-2 ring-red-200' : ''}
        ${rest.isActiveConversation ? 'ring-2 ring-[#8B5CF6]/30 shadow-[0_0_0_2px_rgba(139,92,246,0.3)]' : ''}
      `}
    >
      {rest.isActiveConversation && (
        <div
          className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-[#8B5CF6] text-white flex items-center justify-center"
          title="Task chat open"
        >
          <MessageCircle className="w-4 h-4" />
        </div>
      )}
      <TaskTile
        task={task}
        isExpanded={rest.isExpanded}
        onClick={rest.onTaskClick}
        variant={rest.variant}
        className={rest.isExpanded ? 'border-0 shadow-none rounded-b-none bg-gradient-to-r from-white to-slate-50/50' : ''}
        isActiveConversation={rest.isActiveConversation}
        showDragHandle={canDrag}
        isDragging={isDragging}
      />
      {rest.isExpanded && !rest.gridLayout && (
        <div className="px-5 pb-5 pt-4 bg-gradient-to-b from-slate-50/50 to-white animate-in slide-in-from-top-2 duration-200">
          <TaskDetails
            task={task}
            onComplete={rest.onComplete}
            onSkip={rest.onSkip}
            onChecklistToggle={rest.onChecklistToggle}
            onAskHarvey={rest.onAskHarvey}
            onDelete={rest.onDelete}
            isLoading={rest.isActionLoading}
            showHeader={false}
            allTasks={rest.allTasks}
          />
        </div>
      )}
    </div>
  )
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
  onChecklistToggle,
  isActionLoading = false,
  isLoading = false,
  activeConversationTaskId = null,
  onAskHarvey,
  onTaskDeleted,
  onReorder,
  availableWindows = [],
  allTasks: allTasksProp,
}: TimelineViewProps) {
  const [showPast, setShowPast] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [deleteModalTask, setDeleteModalTask] = useState<DashboardTask | null>(null)
  const [deleteModalDependents, setDeleteModalDependents] = useState<Array<{ id: string; title: string }>>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const [overInfo, setOverInfo] = useState<{
    draggedId: string
    overId: string
    destDateStr: string
  } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const allTasks = useMemo(
    () => allTasksProp ?? flattenTasks(tasks),
    [allTasksProp, tasks]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) {
        setOverInfo(null)
        return
      }
      const draggedId = String(active.id)
      const overId = String(over.id)

      // Hovering over a DroppableSection container (YYYY-MM-DD date string as id).
      // overId won't match any task id, so the placeholder index falls through to
      // sectionTasks.length → placeholder renders at the end of the section.
      if (/^\d{4}-\d{2}-\d{2}$/.test(overId)) {
        const draggedTask = allTasks.find((t) => t.id === draggedId)
        if (!draggedTask) return
        setOverInfo({ draggedId, overId, destDateStr: overId })
        return
      }

      const overTask = allTasks.find((t) => t.id === overId)
      const draggedTask = allTasks.find((t) => t.id === draggedId)
      if (!overTask || !draggedTask) return
      const destDateStr = overTask.scheduledDate?.split('T')[0]
      if (!destDateStr) return
      setOverInfo({ draggedId, overId, destDateStr })
    },
    [allTasks]
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      setActiveDragId(null)
      setOverInfo(null)
      if (!over || active.id === over.id || !onReorder || !tasks) return
      const draggedId = String(active.id)
      const overId = String(over.id)
      const draggedTask = allTasks.find((t) => t.id === draggedId)
      if (!draggedTask) return
      if (!canDragTask(draggedTask)) return

      const sourceDateStr = draggedTask.scheduledDate ? draggedTask.scheduledDate.split('T')[0] : null

      // When over.id is a YYYY-MM-DD string, the pointer landed on a DroppableSection
      // container (empty space below the last task). Append dragged task at end of that day.
      const isDroppedOnSection = /^\d{4}-\d{2}-\d{2}$/.test(overId)

      let destDateStr: string | null
      let newDestOrder: string[]
      let sourceSiblingsOrder: string[] = []

      if (isDroppedOnSection) {
        destDateStr = overId

        const destSectionTasks = allTasks.filter(
          (t) => t.scheduledDate && t.scheduledDate.split('T')[0] === destDateStr
        )
        const sourceSectionTasks = sourceDateStr
          ? allTasks.filter((t) => t.scheduledDate && t.scheduledDate.split('T')[0] === sourceDateStr)
          : []

        // All IDs in dest section sorted by position, with dragged task excluded (cross-day case)
        const destIdsByPosition = [...destSectionTasks]
          .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
          .map((t) => t.id)
          .filter((id) => id !== draggedId)

        // Append dragged task at the end of destination section
        newDestOrder = [...destIdsByPosition, draggedId]

        if (sourceDateStr !== destDateStr) {
          const sourceOrdered = [...sourceSectionTasks].sort(
            (a, b) => (a.position ?? 999) - (b.position ?? 999)
          )
          sourceSiblingsOrder = sourceOrdered.map((t) => t.id).filter((id) => id !== draggedId)
          console.log('[DnD] Section drop (cross-day): task appended at end of section container')
          console.log('[DnD] dragged task:', draggedTask.title, '| source day:', sourceDateStr)
          console.log('[DnD] destination day:', destDateStr)
          console.log('[DnD] sourceSiblingsOrder:', sourceSiblingsOrder)
          console.log('[DnD] destinationSiblingsOrder:', newDestOrder)
        } else {
          // Same-day: move to end. If it's already last, bail out (no-op).
          const allDestIds = [...destSectionTasks]
            .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
            .map((t) => t.id)
          if (allDestIds[allDestIds.length - 1] === draggedId) return
          newDestOrder = [...allDestIds.filter((id) => id !== draggedId), draggedId]
        }
      } else {
        // Drop on a task card (existing logic)
        const overTask = allTasks.find((t) => t.id === overId)
        if (!overTask) return
        destDateStr = overTask.scheduledDate ? overTask.scheduledDate.split('T')[0] : null
        if (!destDateStr) return

        const destSectionTasks = allTasks.filter(
          (t) => t.scheduledDate && t.scheduledDate.split('T')[0] === destDateStr
        )
        const sourceSectionTasks = sourceDateStr
          ? allTasks.filter((t) => t.scheduledDate && t.scheduledDate.split('T')[0] === sourceDateStr)
          : []

        // Sorted by position (use copies to avoid mutating filtered arrays)
        const destIdsByPosition = [...destSectionTasks]
          .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
          .map((t) => t.id)
        const overIndex = destIdsByPosition.indexOf(overId)
        if (overIndex < 0) return

        if (sourceDateStr === destDateStr) {
          // Same-day: move within the list (arrayMove)
          const currentIndex = destIdsByPosition.indexOf(draggedId)
          newDestOrder = arrayMove(destIdsByPosition, currentIndex, overIndex)
        } else {
          // Cross-day: INSERT into destination at drop index.
          const sourceOrdered = [...sourceSectionTasks].sort(
            (a, b) => (a.position ?? 999) - (b.position ?? 999)
          )
          sourceSiblingsOrder = sourceOrdered.map((t) => t.id).filter((id) => id !== draggedId)
          newDestOrder = [
            ...destIdsByPosition.slice(0, overIndex),
            draggedId,
            ...destIdsByPosition.slice(overIndex),
          ]
          console.log('[DnD] Cross-day drag detected')
          console.log('[DnD] dragged task:', draggedTask.title, '| source day:', sourceDateStr)
          console.log('[DnD] destination day:', destDateStr)
          console.log('[DnD] sourceSiblingsOrder:', sourceSiblingsOrder)
          console.log('[DnD] destinationSiblingsOrder:', newDestOrder)
        }
      }

      if (!destDateStr) return

      const depIds = (draggedTask.dependsOn ?? []).filter(Boolean)
      const dependents = allTasks.filter((t) => (t.dependsOn ?? []).includes(draggedTask.id))

      for (const depId of depIds) {
        const depTask = allTasks.find((t) => t.id === depId)
        if (!depTask) continue
        const depDateStr = depTask.scheduledDate ? depTask.scheduledDate.split('T')[0] : null
        if (depDateStr && depDateStr > destDateStr) {
          setToast(`Can't reorder: '${depTask.title}' must come first`)
          return
        }
        if (depDateStr === destDateStr) {
          const depPos = newDestOrder.indexOf(depId)
          const draggedPos = newDestOrder.indexOf(draggedId)
          if (depPos >= 0 && draggedPos >= 0 && depPos > draggedPos) {
            setToast(`Can't reorder: '${depTask.title}' must come first`)
            return
          }
        }
      }
      for (const dep of dependents) {
        const depDateStr = dep.scheduledDate ? dep.scheduledDate.split('T')[0] : null
        if (depDateStr && depDateStr < destDateStr) {
          setToast(`Can't reorder: '${dep.title}' must come first`)
          return
        }
        if (depDateStr === destDateStr) {
          const depPos = newDestOrder.indexOf(dep.id)
          const draggedPos = newDestOrder.indexOf(draggedId)
          if (depPos >= 0 && draggedPos >= 0 && depPos < draggedPos) {
            setToast(`Can't reorder: '${dep.title}' must come first`)
            return
          }
        }
      }

      const { windowStart, windowEnd } = getWindowForDay(availableWindows, destDateStr)
      const isFlexible = true
      const winStart = windowStart
      const winEnd = windowEnd

      try {
        await onReorder(draggedId, destDateStr, isFlexible, winStart, winEnd, newDestOrder, sourceSiblingsOrder)
      } catch {
        setToast('Failed to reorder')
      }
    },
    [onReorder, allTasks, tasks, availableWindows]
  )

  const handleDeleteClick = useCallback(
    async (taskId: string) => {
      const task = allTasks.find((t) => t.id === taskId)
      if (!task) return
      setDeleteModalTask(task)
      try {
        const res = await fetch(`/api/tasks/${taskId}/dependents`)
        const json = (await res.json()) as { dependents?: Array<{ id: string; title: string }> }
        setDeleteModalDependents(json.dependents ?? [])
      } catch {
        setDeleteModalDependents([])
      }
    },
    [allTasks]
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteModalTask) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/tasks/${deleteModalTask.id}`, { method: 'DELETE' })
      const data = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete task')
      }
      onTaskDeleted?.(deleteModalTask.id)
      onTaskClick(null)
      setDeleteModalTask(null)
    } catch (err) {
      console.error('[TimelineView] Delete task failed:', err)
    } finally {
      setIsDeleting(false)
    }
  }, [deleteModalTask, onTaskDeleted, onTaskClick])

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
    isPast = false,
    sectionDateStr: string | null = null
  ) => {
    if (sectionTasks.length === 0) {
      return null
    }

    const isSortable = Boolean(onReorder)

    // Destination section: this is where a cross-section drag would land
    const isDestSection =
      isSortable &&
      activeDragId !== null &&
      overInfo !== null &&
      sectionDateStr !== null &&
      overInfo.destDateStr === sectionDateStr &&
      !sectionTasks.some((t) => t.id === overInfo.draggedId)

    // Index in this section at which to inject the drop placeholder (-1 = no placeholder)
    const destPlaceholderIndex =
      isDestSection && overInfo
        ? (() => {
            const idx = sectionTasks.findIndex((t) => t.id === overInfo.overId)
            return idx >= 0 ? idx : sectionTasks.length
          })()
        : -1

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

        {isSortable ? (
          <SortableContext items={sectionTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {(() => {
              const nodes: React.ReactNode[] = []
              sectionTasks.forEach((task, idx) => {
                const isExpanded = expandedTaskId === task.id
                const isActiveConversation = activeConversationTaskId === task.id
                if (destPlaceholderIndex === idx) {
                  nodes.push(
                    <div
                      key="__dnd-placeholder__"
                      className="h-16 rounded-xl border-2 border-dashed border-[#895af6]/40 bg-[#895af6]/5 transition-all duration-200"
                      aria-hidden
                    />
                  )
                }
                nodes.push(
                  <SortableTaskItem
                    key={task.id}
                    task={task}
                    sectionDateStr={sectionDateStr}
                    isExpanded={isExpanded}
                    onTaskClick={onTaskClick}
                    variant={gridLayout ? 'compact' : 'default'}
                    gridLayout={gridLayout}
                    isOverdue={isOverdue}
                    isPast={isPast}
                    isActiveConversation={isActiveConversation}
                    onComplete={onComplete}
                    onSkip={onSkip}
                    onChecklistToggle={onChecklistToggle}
                    onAskHarvey={onAskHarvey}
                    onDelete={handleDeleteClick}
                    isActionLoading={isActionLoading}
                    allTasks={allTasks}
                  />
                )
              })
              if (destPlaceholderIndex === sectionTasks.length) {
                nodes.push(
                  <div
                    key="__dnd-placeholder__"
                    className="h-16 rounded-xl border-2 border-dashed border-[#895af6]/40 bg-[#895af6]/5 transition-all duration-200"
                    aria-hidden
                  />
                )
              }
              const containerClass = gridLayout ? 'grid grid-cols-2 gap-4' : 'space-y-3'
              const isDateSection = sectionDateStr !== null && /^\d{4}-\d{2}-\d{2}$/.test(sectionDateStr)
              return isDateSection ? (
                <DroppableSection id={sectionDateStr!} className={containerClass}>
                  {nodes}
                </DroppableSection>
              ) : (
                <div className={containerClass}>{nodes}</div>
              )
            })()}
          </SortableContext>
        ) : (
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
                      <MessageCircle className="w-4 h-4" />
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

                  {isExpanded && !gridLayout && (
                    <div
                      className="px-5 pb-5 pt-4 bg-gradient-to-b from-slate-50/50 to-white animate-in slide-in-from-top-2 duration-200"
                    >
                      <TaskDetails
                        task={task}
                        onComplete={onComplete}
                        onSkip={onSkip}
                        onChecklistToggle={onChecklistToggle}
                        onAskHarvey={onAskHarvey}
                        onDelete={handleDeleteClick}
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
        )}
      </section>
    )
  }

  // Loading State
  if (isLoading) {
    return (
      <div className="px-8 pb-12">
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-10 h-10 text-[#895af6] animate-spin mb-4" />
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
          <CheckSquare className="w-12 h-12 text-slate-300 mb-4" />
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
          <PartyPopper className="w-12 h-12 text-green-400 mb-4" />
          <h3 className="text-lg font-semibold text-slate-600 mb-2">All caught up!</h3>
          <p className="text-sm text-slate-400 max-w-sm">
            You&apos;ve completed all your tasks. Great work!
          </p>
        </div>
      </div>
    )
  }

  const pastCount = tasks.past.length

  const content = (
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

      {renderTaskSection('Overdue', tasks.overdue, false, true, false, null)}
      {renderTaskSection('Today', tasks.today, false, false, false, tasks.today[0]?.scheduledDate?.split('T')[0] ?? null)}
      {renderTaskSection('Tomorrow', tasks.tomorrow, false, false, false, tasks.tomorrow[0]?.scheduledDate?.split('T')[0] ?? null)}
      {tasks.weekDays.map((daySection) =>
        renderTaskSection(daySection.label, daySection.tasks, false, false, false, daySection.date)
      )}
      {renderTaskSection('Later', tasks.later, false, false, false, null)}
      {tasks.unscheduled.length > 0 && renderTaskSection('Unscheduled', tasks.unscheduled, false, false, false, null)}

      {/* Past section – collapsible, at end */}
      {pastCount > 0 && (
        <div
          className="overflow-hidden transition-[max-height] duration-300 ease-out"
          style={{ maxHeight: showPast ? '5000px' : '0' }}
          aria-hidden={!showPast}
        >
          {renderTaskSection('Past', tasks.past, false, false, true, null)}
        </div>
      )}

      {/* Toast for dependency block */}
      {toast && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm shadow-lg animate-in fade-in duration-200"
        >
          {toast}
        </div>
      )}
    </div>
  )

  const draggedTask = activeDragId ? allTasks.find((t) => t.id === activeDragId) : null

  const deleteModal = (
    <DeleteTaskModal
      isOpen={deleteModalTask !== null}
      onClose={() => !isDeleting && setDeleteModalTask(null)}
      onConfirm={handleDeleteConfirm}
      taskTitle={deleteModalTask?.title ?? ''}
      dependentTasks={deleteModalDependents}
      isDeleting={isDeleting}
    />
  )

  if (onReorder) {
    return (
      <>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => setActiveDragId(String(active.id))}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {content}
          <DragOverlay>
            {draggedTask ? (
              <div className="rounded-xl overflow-hidden shadow-xl border border-slate-200 bg-white opacity-90 cursor-grabbing">
                <TaskTile task={draggedTask} variant="default" isDragging={false} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        {deleteModal}
      </>
    )
  }

  return (
    <>
      {content}
      {deleteModal}
    </>
  )
}
