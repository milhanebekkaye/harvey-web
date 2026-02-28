/**
 * Dashboard Page - List & Timeline Views
 *
 * Main app interface with chat sidebar (40%) and list/timeline view (60%).
 * Fetches real data from API endpoints.
 *
 * List View: Tasks organized by date sections (current timeline list)
 * Timeline View: Expanded vertical project timeline card view
 *
 * Features:
 * - Real task data from /api/tasks
 * - Real conversation history from /api/discussions/[projectId]
 * - Task status updates (complete, skip)
 * - Glass-morphism chat sidebar with Harvey AI
 * - Unified right-header with Filter + View popover (List/Timeline switch)
 *
 * Components Used:
 * - ChatSidebar: Left sidebar with conversation
 * - TimelineView: Task list grouped by date
 * - ProjectTimelineView: Expanded timeline cards
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from '@/lib/auth/auth-service'

// Import reusable dashboard components
import {
  ChatSidebar,
  TimelineView,
  ProjectTimelineView,
} from '@/components/dashboard'
import type { ViewMode } from '@/components/dashboard'

// Import types
import type { TaskGroups, DashboardTask } from '@/types/task.types'
import type { ChatWidget, WidgetAnswerMeta } from '@/types/api.types'

// ============================================
// API Response Types
// ============================================

interface TasksApiResponse {
  tasks: TaskGroups
  projectId: string
  projectTitle: string
  availableTime?: Array<{ day: string; start: string; end: string }>
}

/** Stored message format from Discussion (role, content, timestamp, optional widget, optional messageType) */
interface StoredMsg {
  role: 'assistant' | 'user'
  content: string
  timestamp: string
  widget?: ChatWidget
  messageType?: 'check-in'
  answered?: boolean
}

interface DiscussionApiResponse {
  messages: StoredMsg[]
  projectTitle: string
}

// ============================================
// Dashboard Page Component
// ============================================

export default function DashboardPage() {
  const router = useRouter()

  // ===== STATE =====

  /**
   * Tasks grouped by date (from API)
   */
  const [tasks, setTasks] = useState<TaskGroups | null>(null)

  /**
   * Conversation messages (from API) — passed as initialMessages to ChatSidebar
   */
  const [messages, setMessages] = useState<StoredMsg[]>([])

  /**
   * Active project info
   */
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectTitle, setProjectTitle] = useState<string>('')
  /**
   * Availability windows from project.contextData.available_time (for drag reorder)
   */
  const [availableTime, setAvailableTime] = useState<Array<{ day: string; start: string; end: string }>>([])

  /**
   * Loading states
   */
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(true)
  const [isActionLoading] = useState(false)

  /**
   * Error state
   */
  const [error, setError] = useState<string | null>(null)

  /**
   * Currently expanded task ID (timeline view)
   */
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)

  /**
   * Current view mode: list or timeline
   */
  const [view, setView] = useState<ViewMode>('timeline')

  /** Floating "View" selector (List/Timeline) visibility. */
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false)
  const viewMenuRef = useRef<HTMLDivElement>(null)

  /** Only auto-expand first task once on initial load; avoids refetch when expandedTaskId changes */
  const hasAutoExpandedRef = useRef(false)

  /**
   * Messages appended by dashboard (e.g. after Complete/Skip, or daily check-in) so ChatSidebar can show them.
   * Each has createdAt (ISO string) so ChatSidebar can sort merged messages correctly.
   */
  const [appendedByDashboard, setAppendedByDashboard] = useState<
    Array<{ id: string; role: 'assistant' | 'user'; content: string; createdAt: string; widget?: ChatWidget; messageType?: 'check-in' }>
  >([])

  /**
   * Daily check-in: streaming content while the check-in message is being generated.
   * When set, ChatSidebar shows this as a Harvey message at the bottom (updating live).
   */
  const [checkInStreaming, setCheckInStreaming] = useState<string | null>(null)

  /**
   * Brief error message when check-in API fails; cleared after a few seconds.
   */
  const [checkInError, setCheckInError] = useState<string | null>(null)

  /** Guard: don't run a second check-in while one is already in progress. */
  const checkInInProgressRef = useRef(false)

  /**
   * Per-task chat UI state (Step 1: UI only, no API/DB).
   * - isPanelOpen: conversation nav panel visibility
   * - activeConversation: 'project' or task id
   * - openTaskChats: list of task chats the user has opened
   */
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [activeConversation, setActiveConversation] = useState<'project' | string>('project')
  const [openTaskChats, setOpenTaskChats] = useState<
    Array<{
      id: string
      title: string
      label: string
      discussionId?: string
      initialMessages?: Array<{ role: string; content: string; timestamp: string }>
    }>
  >([])

  /**
   * Rebuild schedule modal (moved from sidebar header to top-right toolbar).
   */
  const [showRebuildModal, setShowRebuildModal] = useState(false)
  const [isRebuilding, setIsRebuilding] = useState(false)

  // ===== DATA FETCHING =====

  /**
   * Fetch tasks from API
   */
  const fetchTasks = useCallback(async () => {
    console.log('[Dashboard] Fetching tasks...')
    setIsLoadingTasks(true)
    setError(null)

    try {
      const response = await fetch('/api/tasks')

      if (!response.ok) {
        const errorData = await response.json()

        // Handle unauthenticated — redirect to signin before any other handling
        if (response.status === 401) {
          console.log('[Dashboard] Unauthenticated, redirecting to signin')
          router.push('/signin')
          return
        }

        // Handle "no project" case - redirect to onboarding
        if (errorData.code === 'NO_PROJECT') {
          console.log('[Dashboard] No active project, redirecting to onboarding')
          router.push('/onboarding')
          return
        }

        throw new Error(errorData.error || 'Failed to fetch tasks')
      }

      const data: TasksApiResponse = await response.json()
      console.log('[Dashboard] Tasks loaded:', {
        past: data.tasks.past.length,
        overdue: data.tasks.overdue.length,
        today: data.tasks.today.length,
        tomorrow: data.tasks.tomorrow.length,
        weekDays: data.tasks.weekDays.length,
        later: data.tasks.later.length,
        unscheduled: data.tasks.unscheduled.length,
      })

      setTasks(data.tasks)
      setProjectId(data.projectId)
      setProjectTitle(data.projectTitle)
      setAvailableTime(Array.isArray(data.availableTime) ? data.availableTime : [])

      // Auto-expand first task only once on initial load (so expand/collapse doesn't trigger refetch)
      if (!hasAutoExpandedRef.current) {
        hasAutoExpandedRef.current = true
        if (data.tasks.overdue.length > 0) {
          setExpandedTaskId(data.tasks.overdue[0].id)
        } else if (data.tasks.today.length > 0) {
          setExpandedTaskId(data.tasks.today[0].id)
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load tasks'
      console.error('[Dashboard] Error fetching tasks:', errorMessage)
      setError(errorMessage)
    } finally {
      setIsLoadingTasks(false)
    }
  }, [router])

  /**
   * Fetch task discussions list for the project (persistence across refresh).
   * Populates openTaskChats so task chats reappear in the nav panel after reload.
   */
  const fetchTaskChatsList = useCallback(async (projId: string) => {
    try {
      const response = await fetch(`/api/discussions/task/list?projectId=${encodeURIComponent(projId)}`)
      if (!response.ok) return
      const data = await response.json()
      const list = (data.discussions ?? []).map(
        (d: { id: string; taskId: string | null; task: { title: string; label: string | null } | null }) => ({
          id: d.taskId ?? d.id,
          title: d.task?.title ?? 'Unknown Task',
          label: d.task?.label ?? 'general',
          discussionId: d.id,
        })
      )
      setOpenTaskChats(list)
    } catch (err) {
      console.warn('[Dashboard] Error fetching task chats list:', err)
    }
  }, [])

  /**
   * Fetch conversation messages from API
   */
  const fetchMessages = useCallback(async (projId: string) => {
    console.log('[Dashboard] Fetching messages for project:', projId)
    setIsLoadingMessages(true)

    try {
      const response = await fetch(`/api/discussions/${projId}`)

      if (!response.ok) {
        const errorData = await response.json()
        console.warn('[Dashboard] Could not load messages:', errorData.error)
        return // Non-critical, don't show error to user
      }

      const data: DiscussionApiResponse = await response.json()
      console.log('[Dashboard] Messages loaded:', data.messages.length)

      setMessages(data.messages)
    } catch (err: unknown) {
      console.warn('[Dashboard] Error fetching messages:', err)
      // Non-critical error, don't show to user
    } finally {
      setIsLoadingMessages(false)
    }
  }, [])

  // ===== EFFECTS =====

  /**
   * Fetch tasks on mount
   */
  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  /**
   * Fetch messages when projectId is available
   */
  useEffect(() => {
    if (projectId) {
      fetchMessages(projectId)
      setAppendedByDashboard([])
    }
  }, [projectId, fetchMessages])

  /**
   * Fetch task discussions list when projectId is available (repopulate nav after refresh)
   */
  useEffect(() => {
    if (projectId) fetchTaskChatsList(projectId)
  }, [projectId, fetchTaskChatsList])

  /** Run check-in (shared logic for auto and test). timeOfDayOverride skips rate limit and "brand new" check. */
  const runCheckIn = useCallback(
    async (timeOfDayOverride?: 'morning' | 'afternoon' | 'evening') => {
      if (!projectId || !tasks) return
      if (checkInInProgressRef.current) return
      const totalTasks =
        tasks.past.length +
        tasks.overdue.length +
        tasks.today.length +
        tasks.tomorrow.length +
        tasks.later.length +
        tasks.unscheduled.length +
        tasks.weekDays.reduce((s, d) => s + d.tasks.length, 0)
      if (totalTasks === 0 && !timeOfDayOverride) return

      const storageKey = `harvey_checkin_${projectId}`
      const lastStr = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null

      if (!timeOfDayOverride) {
        if (messages.length === 0 && !lastStr) return
        if (lastStr) {
          const lastTs = parseInt(lastStr, 10)
          if (!Number.isNaN(lastTs)) {
            const now = Date.now()
            const threeHoursMs = 3 * 60 * 60 * 1000
            const sameDay = new Date(lastTs).toDateString() === new Date(now).toDateString()
            if (sameDay && now - lastTs < threeHoursMs) return
          }
        }
      }

      checkInInProgressRef.current = true
      setCheckInError(null)
      setCheckInStreaming('')
      try {
        const res = await fetch('/api/chat/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, ...(timeOfDayOverride ? { timeOfDay: timeOfDayOverride } : {}) }),
        })
        if (!res.ok || !res.body) {
          setCheckInError('Harvey couldn\'t say hi right now.')
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let content = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          content += decoder.decode(value, { stream: true })
          setCheckInStreaming(content)
        }
        setCheckInStreaming(null)
        if (!content.trim()) return

        await fetch(`/api/discussions/${projectId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'assistant',
            content: content.trim(),
            messageType: 'check-in',
          }),
        })
        const checkInMsg = {
          id: `checkin-${Date.now()}`,
          role: 'assistant' as const,
          content: content.trim(),
          createdAt: new Date().toISOString(),
          messageType: 'check-in' as const,
        }
        setAppendedByDashboard((prev) => [...prev, checkInMsg])
        if (!timeOfDayOverride) {
          try {
            localStorage.setItem(storageKey, String(Date.now()))
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.warn('[Dashboard] Check-in failed:', err)
        setCheckInError('Harvey couldn\'t say hi right now.')
        setCheckInStreaming(null)
      } finally {
        checkInInProgressRef.current = false
      }
    },
    [projectId, tasks, messages.length]
  )

  /**
   * Daily check-in: trigger when dashboard has project + tasks, returning user, and rate limit allows.
   */
  const triggerCheckInIfNeeded = useCallback(() => {
    runCheckIn()
  }, [runCheckIn])

  useEffect(() => {
    if (!projectId || !tasks || isLoadingTasks) return
    const t = setTimeout(triggerCheckInIfNeeded, 300)
    return () => clearTimeout(t)
  }, [projectId, tasks, isLoadingTasks, triggerCheckInIfNeeded])

  useEffect(() => {
    if (!checkInError) return
    const t = setTimeout(() => setCheckInError(null), 3000)
    return () => clearTimeout(t)
  }, [checkInError])

  /**
   * Close the floating view selector when clicking outside or pressing Escape.
   */
  useEffect(() => {
    if (!isViewMenuOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (!viewMenuRef.current) return
      if (viewMenuRef.current.contains(event.target as Node)) return
      setIsViewMenuOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsViewMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isViewMenuOpen])

  // ===== HANDLERS =====

  /**
   * Handle sign out
   */
  const handleSignOut = async () => {
    const result = await signOut()
    if (result.success) {
      router.push('/signin')
    } else {
      alert('Sign out failed: ' + result.error?.message)
    }
  }

  /**
   * Toggle task expansion in timeline view
   */
  const handleTaskClick = (taskId: string) => {
    setExpandedTaskId(expandedTaskId === taskId ? null : taskId)
  }

  /**
   * Switch active conversation (project or task). Closes nav panel.
   * Used when user selects an item in ConversationNavPanel.
   */
  const handleSelectConversation = (id: 'project' | string) => {
    setActiveConversation(id)
    setIsPanelOpen(false)
  }

  /**
   * Open or focus task chat for a task (from "Ask Harvey" on task card).
   * Adds task to openTaskChats, creates or fetches task discussion via API, stores discussionId.
   * Does not open the nav panel.
   */
  const handleAskHarvey = async (taskId: string, title: string, label: string) => {
    setOpenTaskChats((prev) => {
      if (prev.some((t) => t.id === taskId)) return prev
      return [...prev, { id: taskId, title, label }]
    })
    setActiveConversation(taskId)

    if (!projectId) return
    try {
      const res = await fetch('/api/discussions/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, projectId }),
      })
      if (!res.ok) {
        console.warn('[Dashboard] Could not create/fetch task discussion:', await res.text())
        return
      }
      const data = await res.json()
      const discussion = data.discussion
      const discussionId = discussion?.id
      const messages = Array.isArray(discussion?.messages) ? discussion.messages : undefined
      if (discussionId) {
        setOpenTaskChats((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, discussionId, initialMessages: messages }
              : t
          )
        )
      }
    } catch (err) {
      console.warn('[Dashboard] handleAskHarvey API error:', err)
    }
  }

  /**
   * Rebuild schedule: reset and redirect to loading. Used by top-right toolbar.
   */
  const handleRebuild = async () => {
    if (!projectId) return
    setIsRebuilding(true)
    try {
      const response = await fetch('/api/schedule/reset-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!response.ok) {
        const rawText = await response.text()
        let errorMessage = `Server Error: ${response.status} ${response.statusText}`
        try {
          const json = JSON.parse(rawText)
          if (json.error) errorMessage = json.error
        } catch {
          // ignore
        }
        throw new Error(errorMessage)
      }
      router.push(`/loading?projectId=${projectId}`)
    } catch (err) {
      console.error('[Dashboard] Rebuild failed:', err)
      setIsRebuilding(false)
      setShowRebuildModal(false)
      alert(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /** Append message to discussion (persist and show in chat) */
  const appendMessageToDiscussion = useCallback(
    async (
      role: 'assistant' | 'user',
      content: string,
      widget?: ChatWidget,
      widgetAnswer?: WidgetAnswerMeta
    ) => {
      if (!projectId) return
      try {
        const res = await fetch(`/api/discussions/${projectId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role,
            content,
            ...(widget != null ? { widget } : {}),
            ...(widgetAnswer != null ? { widgetAnswer } : {}),
          }),
        })
        if (!res.ok) console.error('[Dashboard] Failed to append message')
      } catch (e) {
        console.error('[Dashboard] appendMessageToDiscussion', e)
      }
    },
    [projectId]
  )

  /**
   * Handle task completion (optimistic UI: update timeline immediately, revert on API failure)
   */
  const handleCompleteTask = async (taskId: string) => {
    const previousTask = findTaskById(tasks, taskId)

    // Optimistic update when task is already present in list-view state.
    if (previousTask) {
      setTasks((prev) =>
        prev
          ? updateTaskInGroups(prev, taskId, (t) => ({ ...t, status: 'completed' }))
          : prev
      )
    }
    // Show feedback message + widget in chat immediately (no wait for API)
    const completionMsg = {
      id: `complete-${taskId}-${Date.now()}`,
      role: 'assistant' as const,
      content: 'Nice work! Quick question: how long did that actually take?',
      createdAt: new Date().toISOString(),
      widget: { type: 'completion_feedback' as const, data: { taskId } },
    }
    setAppendedByDashboard((prev) => [...prev, completionMsg])
    void appendMessageToDiscussion(
      completionMsg.role,
      completionMsg.content,
      completionMsg.widget
    )
    // If we were on this task's chat, switch to project chat so the user sees the completion check-in
    if (activeConversation === taskId) setActiveConversation('project')

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to complete task')
      }
      console.log('[Dashboard] Task completed successfully')
      // Sync in background (e.g. server timestamps); optional, keeps UI consistent
      void fetchTasks()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to complete task'
      console.error('[Dashboard] Error completing task:', errorMessage)
      if (previousTask) {
        setTasks((prev) =>
          prev ? updateTaskInGroups(prev, taskId, () => previousTask) : prev
        )
      } else {
        void fetchTasks()
      }
      setAppendedByDashboard((prev) => prev.filter((m) => m.id !== completionMsg.id))
      alert(errorMessage)
    }
  }

  /**
   * Handle task skip (optimistic UI: update timeline immediately, revert on API failure)
   */
  const handleSkipTask = async (taskId: string) => {
    const previousTask = findTaskById(tasks, taskId)

    if (previousTask) {
      setTasks((prev) =>
        prev
          ? updateTaskInGroups(prev, taskId, (t) => ({ ...t, status: 'skipped' }))
          : prev
      )
    }
    const skipMsg = {
      id: `skip-${taskId}-${Date.now()}`,
      role: 'assistant' as const,
      content: 'No problem! Quick question: why are you skipping this?',
      createdAt: new Date().toISOString(),
      widget: { type: 'skip_feedback' as const, data: { taskId } },
    }
    setAppendedByDashboard((prev) => [...prev, skipMsg])
    void appendMessageToDiscussion(skipMsg.role, skipMsg.content, skipMsg.widget)
    // If we were on this task's chat, switch to project chat so the user sees the skip check-in
    if (activeConversation === taskId) setActiveConversation('project')

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'skipped' }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to skip task')
      }
      const data = await response.json()
      const downstreamIds = data?.downstreamSkippedIds as string[] | undefined
      if (downstreamIds?.length) {
        setTasks((prev) =>
          prev ? setTasksStatusInGroups(prev, downstreamIds, 'skipped') : prev
        )
      }
      console.log('[Dashboard] Task skipped successfully')
      void fetchTasks()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to skip task'
      console.error('[Dashboard] Error skipping task:', errorMessage)
      if (previousTask) {
        setTasks((prev) =>
          prev ? updateTaskInGroups(prev, taskId, () => previousTask) : prev
        )
      } else {
        void fetchTasks()
      }
      setAppendedByDashboard((prev) => prev.filter((m) => m.id !== skipMsg.id))
      alert(errorMessage)
    }
  }

  /**
   * Handle task edit (placeholder for now)
   */
  const handleEditTask = (taskId: string) => {
    console.log('[Dashboard] Edit task:', taskId)
    // TODO: Implement edit modal or inline editing
    alert('Task editing coming soon!')
  }

  /**
   * Handle drag-and-drop reorder (list view). Calls reorder API then refreshes tasks.
   */
  const handleReorder = useCallback(
    async (
      taskId: string,
      newDate: string,
      isFlexible: boolean,
      windowStart: string | null,
      windowEnd: string | null,
      destinationSiblingsOrder: string[],
      sourceSiblingsOrder: string[]
    ) => {
      const response = await fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          newDate,
          isFlexible,
          windowStart,
          windowEnd,
          destinationSiblingsOrder,
          sourceSiblingsOrder,
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to reorder')
      }
      await fetchTasks()
    },
    [fetchTasks]
  )

  /**
 * Helper: Find task by ID across all groups
 */
function findTaskById(tasks: TaskGroups | null, taskId: string): DashboardTask | null {
  if (!tasks) return null

  const allTasks = [
    ...tasks.past,
    ...tasks.overdue,
    ...tasks.today,
    ...tasks.tomorrow,
    ...tasks.weekDays.flatMap((d) => d.tasks),
    ...tasks.later,
    ...tasks.unscheduled,
  ]

  return allTasks.find((t) => t.id === taskId) || null
}

/**
 * Helper: Update one task in TaskGroups by ID (returns new TaskGroups).
 */
function updateTaskInGroups(
  prev: TaskGroups,
  taskId: string,
  updater: (t: DashboardTask) => DashboardTask
): TaskGroups {
  const update = (t: DashboardTask) => (t.id === taskId ? updater(t) : t)
  return {
    ...prev,
    past: prev.past.map(update),
    overdue: prev.overdue.map(update),
    today: prev.today.map(update),
    tomorrow: prev.tomorrow.map(update),
    weekDays: prev.weekDays.map((d) => ({ ...d, tasks: d.tasks.map(update) })),
    later: prev.later.map(update),
    unscheduled: prev.unscheduled.map(update),
  }
}

/**
 * Helper: Set status for multiple tasks by ID (e.g. cascade skip).
 */
function setTasksStatusInGroups(
  prev: TaskGroups,
  taskIds: string[],
  status: 'completed' | 'skipped'
): TaskGroups {
  const ids = new Set(taskIds)
  const update = (t: DashboardTask) => (ids.has(t.id) ? { ...t, status } : t)
  return {
    ...prev,
    past: prev.past.map(update),
    overdue: prev.overdue.map(update),
    today: prev.today.map(update),
    tomorrow: prev.tomorrow.map(update),
    weekDays: prev.weekDays.map((d) => ({ ...d, tasks: d.tasks.map(update) })),
    later: prev.later.map(update),
    unscheduled: prev.unscheduled.map(update),
  }
}

/**
 * Handle checklist item toggle
 * Updates local state immediately + persists to database
 */
const handleChecklistToggle = async (taskId: string, itemId: string, done: boolean) => {
  console.log('[Dashboard] Checklist toggle:', { taskId, itemId, done })

  // Find the task to get full checklist
  const task = findTaskById(tasks, taskId)
  if (!task) {
    console.error('[Dashboard] Task not found:', taskId)
    return
  }

  // Create updated checklist
  const updatedChecklist = task.checklist.map((item) =>
    item.id === itemId ? { ...item, done } : item
  )

  // Update local state immediately (optimistic update)
  setTasks((prevTasks) => {
    if (!prevTasks) return prevTasks

    const updateTask = (t: DashboardTask): DashboardTask => {
      if (t.id !== taskId) return t
      return {
        ...t,
        checklist: updatedChecklist,
      }
    }

    return {
      ...prevTasks,
      past: prevTasks.past.map(updateTask),
      overdue: prevTasks.overdue.map(updateTask),
      today: prevTasks.today.map(updateTask),
      tomorrow: prevTasks.tomorrow.map(updateTask),
      weekDays: prevTasks.weekDays.map((daySection) => ({
        ...daySection,
        tasks: daySection.tasks.map(updateTask),
      })),
      later: prevTasks.later.map(updateTask),
      unscheduled: prevTasks.unscheduled.map(updateTask),
    }
  })

  // Persist to database
  try {
    const response = await fetch(`/api/tasks/${taskId}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist: updatedChecklist }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('[Dashboard] Failed to save checklist:', errorData.error)
      
      // Revert optimistic update on failure
      await fetchTasks()
    } else {
      console.log('[Dashboard] Checklist saved successfully')
    }
  } catch (error) {
    console.error('[Dashboard] Error saving checklist:', error)
    
    // Revert optimistic update on error
    await fetchTasks()
  }
}

  // ===== RENDER =====

  // Error state
  if (error && !isLoadingTasks) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FAF9F6]">
        <div className="text-center max-w-md">
          <span className="material-symbols-outlined text-5xl text-red-400 mb-4">
            error
          </span>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Something went wrong</h2>
          <p className="text-slate-500 mb-4">{error}</p>
          <button
            onClick={() => fetchTasks()}
            className="px-4 py-2 bg-[#895af6] text-white rounded-lg font-medium hover:bg-[#7849d9] transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#FAF9F6]">
      {/* ========== LEFT SIDEBAR - Interactive Chat (40%) ========== */}
      <ChatSidebar
        key={`chat-${projectId ?? ''}-${isLoadingMessages ? 'loading' : 'ready'}`}
        initialMessages={messages}
        projectTitle={projectTitle}
        projectId={projectId}
        isLoading={isLoadingMessages}
        onSignOut={handleSignOut}
        onTasksChanged={fetchTasks}
        onAppendMessage={appendMessageToDiscussion}
        appendedByParent={appendedByDashboard}
        streamingCheckIn={checkInStreaming}
        checkInError={checkInError}
        onTestCheckIn={runCheckIn}
        activeConversation={activeConversation}
        openTaskChats={openTaskChats}
        isPanelOpen={isPanelOpen}
        onPanelOpen={() => setIsPanelOpen(true)}
        onPanelClose={() => setIsPanelOpen(false)}
        onSelectConversation={handleSelectConversation}
        onBackToProject={() => setActiveConversation('project')}
      />

      {/* ========== RIGHT AREA - List OR Timeline (60%) ========== */}
      <main className="w-[60%] h-full overflow-y-auto flex flex-col bg-[#FAF9F6]">
        {/* Unified right-header: project title + filter/view actions */}
        <div className="sticky top-0 z-20 bg-[#FAF9F6]/95 backdrop-blur-md px-8 py-6 border-b border-black/5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                Project Timeline
              </h2>
              <p className="text-slate-500 text-sm mt-1">
                {projectTitle || 'Your project plan'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                aria-label="Filter tasks"
              >
                <span className="material-symbols-outlined text-[18px]">filter_list</span>
                Filter
              </button>

              <div className="relative" ref={viewMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsViewMenuOpen((open) => !open)}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                  aria-haspopup="menu"
                  aria-expanded={isViewMenuOpen}
                  aria-label="Open view selector"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {view === 'timeline' ? 'view_timeline' : 'view_list'}
                  </span>
                  View
                  <span className="material-symbols-outlined text-[16px] text-slate-400">
                    expand_more
                  </span>
                </button>

                {isViewMenuOpen && (
                  <div
                    className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-200/70"
                    role="menu"
                    aria-label="View selector"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setView('list')
                        setIsViewMenuOpen(false)
                      }}
                      className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                        view === 'list'
                          ? 'bg-[#895af6]/10 text-[#895af6] font-semibold'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                      role="menuitem"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">view_list</span>
                        List View
                      </span>
                      {view === 'list' && (
                        <span className="material-symbols-outlined text-[18px]">check</span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setView('timeline')
                        setIsViewMenuOpen(false)
                      }}
                      className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                        view === 'timeline'
                          ? 'bg-[#895af6]/10 text-[#895af6] font-semibold'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                      role="menuitem"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">view_timeline</span>
                        Timeline View
                      </span>
                      {view === 'timeline' && (
                        <span className="material-symbols-outlined text-[18px]">check</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* List View (current timeline implementation) */}
        {view === 'list' && (
          <TimelineView
            tasks={tasks}
            expandedTaskId={expandedTaskId}
            onTaskClick={handleTaskClick}
            onComplete={handleCompleteTask}
            onSkip={handleSkipTask}
            onEdit={handleEditTask}
            onChecklistToggle={handleChecklistToggle}
            isActionLoading={isActionLoading}
            isLoading={isLoadingTasks}
            activeConversationTaskId={activeConversation === 'project' ? null : activeConversation}
            onAskHarvey={handleAskHarvey}
            onReorder={handleReorder}
            availableWindows={availableTime}
            allTasks={
              tasks
                ? [
                    ...tasks.past,
                    ...tasks.overdue,
                    ...tasks.today,
                    ...tasks.tomorrow,
                    ...tasks.weekDays.flatMap((d) => d.tasks),
                    ...tasks.later,
                    ...tasks.unscheduled,
                  ]
                : undefined
            }
          />
        )}

        {/* Timeline View */}
        {view === 'timeline' && (
          <ProjectTimelineView
            projectId={projectId}
            onComplete={handleCompleteTask}
            onSkip={handleSkipTask}
            onAskHarvey={handleAskHarvey}
          />
        )}
      </main>

      {/* Rebuild Schedule modal (triggered from top-right toolbar) */}
      {showRebuildModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm border border-slate-100 scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-amber-600 text-3xl">
                  warning
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">
                Rebuild Schedule?
              </h3>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                This will{' '}
                <strong className="text-slate-700">
                  permanently delete all tasks
                </strong>{' '}
                for this project and regenerate a new schedule from scratch
                based on our discussion.
              </p>
              <div className="flex flex-col gap-3 w-full">
                <button
                  type="button"
                  onClick={handleRebuild}
                  disabled={isRebuilding}
                  className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                  {isRebuilding ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Rebuilding...</span>
                    </>
                  ) : (
                    'Yes, Rebuild Schedule'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRebuildModal(false)}
                  disabled={isRebuilding}
                  className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
