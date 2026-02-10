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

import { useState, useEffect, useCallback } from 'react'
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

/** Stored message format from Discussion (role, content, timestamp, optional widget) */
interface StoredMsg {
  role: 'assistant' | 'user'
  content: string
  timestamp: string
  widget?: ChatWidget
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

  /**
   * Messages appended by dashboard (e.g. after Complete/Skip) so ChatSidebar can show them before refetch.
   * Each has createdAt (ISO string) so ChatSidebar can sort merged messages correctly.
   */
  const [appendedByDashboard, setAppendedByDashboard] = useState<
    Array<{ id: string; role: 'assistant' | 'user'; content: string; createdAt: string; widget?: ChatWidget }>
  >([])

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

      // Auto-expand first task if none expanded (prioritize overdue, then today)
      if (!expandedTaskId) {
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
  }, [router, expandedTaskId])

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
   * Handle task completion
   */
  const handleCompleteTask = async (taskId: string) => {
    console.log('[Dashboard] Completing task:', taskId)
    setIsActionLoading(true)

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
      await fetchTasks()

      // Append feedback message to chat (with widget); createdAt ensures correct order when merged in ChatSidebar
      const completionMsg = {
        id: `complete-${taskId}-${Date.now()}`,
        role: 'assistant' as const,
        content: 'Nice work! Quick question: how long did that actually take?',
        createdAt: new Date().toISOString(),
        widget: { type: 'completion_feedback' as const, data: { taskId } },
      }
      setAppendedByDashboard((prev) => [...prev, completionMsg])
      await appendMessageToDiscussion(
        completionMsg.role,
        completionMsg.content,
        completionMsg.widget
      )
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to complete task'
      console.error('[Dashboard] Error completing task:', errorMessage)
      alert(errorMessage)
    } finally {
      setIsActionLoading(false)
    }
  }

  /**
   * Handle task skip
   */
  const handleSkipTask = async (taskId: string) => {
    console.log('[Dashboard] Skipping task:', taskId)
    setIsActionLoading(true)

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

      console.log('[Dashboard] Task skipped successfully')
      await fetchTasks()

      // Append skip feedback message to chat (with widget); createdAt ensures correct order when merged in ChatSidebar
      const skipMsg = {
        id: `skip-${taskId}-${Date.now()}`,
        role: 'assistant' as const,
        content: 'No problem! Quick question: why are you skipping this?',
        createdAt: new Date().toISOString(),
        widget: { type: 'skip_feedback' as const, data: { taskId } },
      }
      setAppendedByDashboard((prev) => [...prev, skipMsg])
      await appendMessageToDiscussion(skipMsg.role, skipMsg.content, skipMsg.widget)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to skip task'
      console.error('[Dashboard] Error skipping task:', errorMessage)
      alert(errorMessage)
    } finally {
      setIsActionLoading(false)
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
    ...tasks.weekDays.flatMap(d => d.tasks),
    ...tasks.nextWeek,
    ...tasks.later,
    ...tasks.unscheduled,
  ]
  
  return allTasks.find(t => t.id === taskId) || null
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
