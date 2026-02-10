/**
 * Dashboard Page - Timeline & Calendar Views
 *
 * Main app interface with chat sidebar (40%) and timeline/calendar view (60%).
 * Fetches real data from API endpoints.
 *
 * Timeline View: Tasks organized by TODAY, TOMORROW,..., NEXT WEEK,
 * Calendar View: Coming soon placeholder
 *
 * Features:
 * - Real task data from /api/tasks
 * - Real conversation history from /api/discussions/[projectId]
 * - Task status updates (complete, skip)
 * - Glass-morphism chat sidebar with Harvey AI
 * - View toggle between Timeline/Calendar
 *
 * Components Used:
 * - ChatSidebar: Left sidebar with conversation
 * - TimelineView: Task list grouped by date
 * - CalendarView: Coming soon placeholder
 * - ViewToggle: View mode toggle + search
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from '@/lib/auth/auth-service'

// Import reusable dashboard components
import {
  ChatSidebar,
  TimelineView,
  CalendarView,
  ViewToggle,
} from '@/components/dashboard'
import type { ViewMode } from '@/components/dashboard'

// Import types
import type { TaskGroups, DashboardTask } from '@/types/task.types'
import type { ChatWidget } from '@/types/api.types'

// ============================================
// API Response Types
// ============================================

interface TasksApiResponse {
  tasks: TaskGroups
  projectId: string
  projectTitle: string
}

/** Stored message format from Discussion (role, content, timestamp, optional widget, optional messageType) */
interface StoredMsg {
  role: 'assistant' | 'user'
  content: string
  timestamp: string
  widget?: ChatWidget
  messageType?: 'check-in'
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
   * Loading states
   */
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(true)
  const [isActionLoading, setIsActionLoading] = useState(false)

  /**
   * Error state
   */
  const [error, setError] = useState<string | null>(null)

  /**
   * Currently expanded task ID (timeline view)
   */
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)

  /**
   * Current view mode: timeline or calendar
   */
  const [view, setView] = useState<ViewMode>('timeline')

  /**
   * Search query for filtering tasks
   */
  const [searchQuery, setSearchQuery] = useState('')

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
        nextWeek: data.tasks.nextWeek.length,
        later: data.tasks.later.length,
        unscheduled: data.tasks.unscheduled.length,
      })

      setTasks(data.tasks)
      setProjectId(data.projectId)
      setProjectTitle(data.projectTitle)

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
        tasks.nextWeek.length +
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

  /** Append message to discussion (persist and show in chat) */
  const appendMessageToDiscussion = useCallback(
    async (role: 'assistant' | 'user', content: string, widget?: ChatWidget) => {
      if (!projectId) return
      try {
        const res = await fetch(`/api/discussions/${projectId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, content, widget }),
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
    if (!previousTask) return

    // Optimistic: show task as completed in timeline immediately
    setTasks((prev) =>
      prev
        ? updateTaskInGroups(prev, taskId, (t) => ({ ...t, status: 'completed' }))
        : prev
    )
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
      setTasks((prev) =>
        prev ? updateTaskInGroups(prev, taskId, () => previousTask) : prev
      )
      setAppendedByDashboard((prev) => prev.filter((m) => m.id !== completionMsg.id))
      alert(errorMessage)
    }
  }

  /**
   * Handle task skip (optimistic UI: update timeline immediately, revert on API failure)
   */
  const handleSkipTask = async (taskId: string) => {
    const previousTask = findTaskById(tasks, taskId)
    if (!previousTask) return

    setTasks((prev) =>
      prev
        ? updateTaskInGroups(prev, taskId, (t) => ({ ...t, status: 'skipped' }))
        : prev
    )
    const skipMsg = {
      id: `skip-${taskId}-${Date.now()}`,
      role: 'assistant' as const,
      content: 'No problem! Quick question: why are you skipping this?',
      createdAt: new Date().toISOString(),
      widget: { type: 'skip_feedback' as const, data: { taskId } },
    }
    setAppendedByDashboard((prev) => [...prev, skipMsg])
    void appendMessageToDiscussion(skipMsg.role, skipMsg.content, skipMsg.widget)

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
      setTasks((prev) =>
        prev ? updateTaskInGroups(prev, taskId, () => previousTask) : prev
      )
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
    ...tasks.nextWeek,
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
    nextWeek: prev.nextWeek.map(update),
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
    nextWeek: prev.nextWeek.map(update),
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
      nextWeek: prevTasks.nextWeek.map(updateTask),
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
      />

      {/* ========== RIGHT AREA - Timeline OR Calendar (60%) ========== */}
      <main className="w-[60%] h-full overflow-y-auto flex flex-col">
        {/* View Toggle & Search */}
        <ViewToggle
          view={view}
          onViewChange={setView}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Timeline View */}
        {view === 'timeline' && (
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
          />
        )}

        {/* Calendar View */}
        {view === 'calendar' && <CalendarView />}
      </main>
    </div>
  )
}
