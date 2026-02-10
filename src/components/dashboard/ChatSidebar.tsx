/**
 * Chat Sidebar Component — Interactive Post-Onboarding Chat
 *
 * Displays conversation history AND allows live interaction with Harvey.
 * Uses Vercel AI SDK's useChat hook for streaming responses.
 *
 * Features:
 * - Harvey header with avatar
 * - REBUILD SCHEDULE Button & Modal
 * - Scrollable message history with streaming support
 * - Active chat input (useChat → /api/chat/project)
 * - Typing indicator while Harvey is responding
 * - Auto-scroll to latest message
 * - Task refetch after tool calls
 */

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import type { ChatWidget } from '@/types/api.types'
import { CompletionFeedbackWidget } from './chat/CompletionFeedbackWidget'
import { SkipFeedbackWidget } from './chat/SkipFeedbackWidget'
import { ReschedulePromptWidget } from './chat/ReschedulePromptWidget'

/**
 * Stored message format from the Discussion model.
 * Matches StoredMessage from api.types.ts (with optional widget).
 */
interface StoredMsg {
  role: 'assistant' | 'user'
  content: string
  timestamp: string
  widget?: ChatWidget
}

/** Single display message (useChat or appended) with optional widget */
interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  widget?: ChatWidget
}

/**
 * Props for ChatSidebar component
 */
interface ChatSidebarProps {
  /**
   * Initial messages loaded from the Discussion (onboarding + previous chat).
   * These are converted to UIMessage format for useChat's initialMessages.
   */
  initialMessages: StoredMsg[]

  /**
   * Project title to show in constraint pill
   */
  projectTitle?: string

  /**
   * Project ID — required for the chat API and rebuild
   */
  projectId: string | null

  /**
   * Whether initial messages are still loading
   */
  isLoading?: boolean

  /**
   * Callback when sign out button is clicked
   */
  onSignOut?: () => void

  /**
   * Callback when tasks may have changed (tool call executed).
   * Dashboard uses this to refetch the task list.
   */
  onTasksChanged?: () => void

  /**
   * Callback when a message is appended from a widget (e.g. feedback).
   * Parent should persist via POST /api/discussions/[projectId]/messages.
   */
  onAppendMessage?: (role: 'user' | 'assistant', content: string, widget?: ChatWidget) => void

  /**
   * Messages appended by parent (e.g. after Complete/Skip) so they show immediately.
   */
  appendedByParent?: DisplayMessage[]
}

/**
 * Convert StoredMessage array to UIMessage array for useChat initialMessages.
 */
function storedToUIMessages(stored: StoredMsg[]): UIMessage[] {
  return stored
    .filter((m) => !m.content.includes('PROJECT_INTAKE_COMPLETE'))
    .map((m, i) => ({
      id: `stored-${i}`,
      role: m.role as 'user' | 'assistant',
      parts: [{ type: 'text' as const, text: m.content }],
    }))
}

/**
 * Extract text content from a UIMessage's parts.
 */
function getTextFromParts(msg: UIMessage): string {
  if (!msg.parts) return ''
  return msg.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

/**
 * Check if a UIMessage contains tool invocation parts.
 * AI SDK v6 uses part.type === 'tool-{name}' (e.g. tool-add_task) or 'dynamic-tool'.
 */
function hasToolCall(msg: UIMessage): boolean {
  if (!msg.parts) return false
  return msg.parts.some(
    (p) => typeof p.type === 'string' && (p.type.startsWith('tool-') || p.type === 'dynamic-tool')
  )
}

/**
 * Check if any assistant message in the conversation contains a tool call.
 * Used after onFinish to trigger task refetch when Harvey executed a tool.
 */
function anyAssistantMessageHasToolCall(messages: UIMessage[]): boolean {
  return messages.some((m) => m.role === 'assistant' && hasToolCall(m))
}

/**
 * ChatSidebar Component
 */
export function ChatSidebar({
  initialMessages,
  projectTitle,
  projectId,
  isLoading = false,
  onSignOut,
  onTasksChanged,
  onAppendMessage: parentOnAppendMessage,
  appendedByParent = [],
}: ChatSidebarProps) {
  const router = useRouter()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Ref so transport body() always reads current projectId at request time (useChat may reuse transport from first render when projectId was null)
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

  // --- STATE ---
  const [showRebuildModal, setShowRebuildModal] = useState(false)
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [appendedFeedbackMessages, setAppendedFeedbackMessages] = useState<DisplayMessage[]>([])

  // --- LOCAL INPUT STATE (useChat doesn't provide input/setInput) ---
  const [inputValue, setInputValue] = useState('')

  /** Append a message (from widget flow); add locally and notify parent to persist */
  const handleAppendMessage = useCallback(
    (role: 'user' | 'assistant', content: string, widget?: ChatWidget) => {
      const id = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      setAppendedFeedbackMessages((prev) => [...prev, { id, role, content, widget }])
      parentOnAppendMessage?.(role, content, widget)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    },
    [parentOnAppendMessage]
  )

  // --- CHAT HOOK ---
  const {
    messages,
    sendMessage,
    status,
    error: chatError,
  } = useChat({
    messages: storedToUIMessages(initialMessages),
    transport: new DefaultChatTransport({
      api: '/api/chat/project',
      body: () => ({
        projectId: projectIdRef.current ?? undefined,
      }),
    }),
    onFinish: ({ messages: finishedMessages }) => {
      const hadToolCall = anyAssistantMessageHasToolCall(finishedMessages)
      console.log('[ChatSidebar] onFinish called', {
        finishedMessagesCount: finishedMessages.length,
        hadToolCall,
      })
      if (hadToolCall) {
        onTasksChanged?.()
      }
    },
  })

  const isTyping = status === 'streaming' || status === 'submitted'

  // --- DEBUG: useChat error ---
  useEffect(() => {
    if (chatError) {
      console.error('[ChatSidebar] ChatSidebar.tsx useChat error:', chatError?.message ?? String(chatError))
    }
  }, [chatError])

  // --- DEBUG: status transitions ---
  useEffect(() => {
    console.log('[ChatSidebar] ChatSidebar.tsx status changed to:', status)
  }, [status])

  // --- AUTO-SCROLL ---
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping, appendedFeedbackMessages])

  // --- DISPLAY LIST: useChat messages (with widget from initialMessages by index) + parent-appended + widget-appended ---
  const displayMessages: DisplayMessage[] = [
    ...messages.map((msg, i) => ({
      id: msg.id || `msg-${i}`,
      role: msg.role as 'user' | 'assistant',
      content: getTextFromParts(msg),
      widget: i < initialMessages.length ? initialMessages[i].widget : undefined,
    })),
    ...appendedByParent,
    ...appendedFeedbackMessages,
  ].filter((m) => m.content || m.widget)

  // --- HANDLERS ---

  /**
   * Handle form submission — send message via useChat
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[ChatSidebar] ChatSidebar.tsx handleSubmit called', {
      projectId,
      inputValueLength: inputValue.length,
      inputValueTruncated: inputValue.slice(0, 80),
      isTyping,
      status,
    })
    if (!inputValue.trim() || isTyping || !projectId) return
    console.log('[ChatSidebar] ChatSidebar.tsx sendMessage({ text: "..." })', {
      textTruncated: inputValue.slice(0, 80),
    })
    sendMessage({ text: inputValue })
    setInputValue('')
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  /**
   * Handle Enter key (submit on Enter, newline on Shift+Enter)
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  /**
   * Auto-resize textarea as user types
   */
  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  /**
   * Handle the Rebuild Action
   */
  const handleRebuild = async () => {
    if (!projectId) return

    setIsRebuilding(true)
    try {
      console.log('[Sidebar] Attempting to rebuild for project:', projectId)

      const response = await fetch('/api/schedule/reset-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })

      if (!response.ok) {
        const rawText = await response.text()
        console.error('[Sidebar] Raw Server Error:', rawText)
        let errorMessage = `Server Error: ${response.status} ${response.statusText}`
        try {
          const json = JSON.parse(rawText)
          if (json.error) errorMessage = json.error
        } catch {
          // Not JSON
        }
        throw new Error(errorMessage)
      }

      console.log('[Sidebar] Rebuild successful, redirecting...')
      router.push(`/loading?projectId=${projectId}`)
    } catch (error) {
      console.error('[Sidebar] Rebuild failed:', error)
      setIsRebuilding(false)
      setShowRebuildModal(false)
      alert(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Format timestamp for display
   */
  const formatTime = (timestamp?: Date | string): string => {
    if (!timestamp) return ''
    try {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    } catch {
      return ''
    }
  }

  return (
    <>
      <aside className="w-[40%] flex flex-col glass-sidebar z-10 relative">
        {/* Harvey Header */}
        <div className="p-6 flex items-center gap-4">
          <div className="size-12 rounded-full bg-[#895af6] flex items-center justify-center text-white shadow-lg overflow-hidden">
            <span className="text-2xl">&#x1F99E;</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Harvey</h1>
            <p className="text-sm text-[#62499c] font-medium opacity-80">
              AI Project Coach
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* --- REBUILD BUTTON --- */}
            <button 
              onClick={() => setShowRebuildModal(true)}
              className="bg-amber-100 hover:bg-amber-200 text-amber-700 p-2 rounded-lg transition-colors mr-1"
              title="Rebuild Schedule"
              disabled={!projectId}
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>

            <button className="bg-primary/10 hover:bg-primary/20 text-[#895af6] p-2 rounded-lg transition-colors">
              <span className="material-symbols-outlined">settings</span>
            </button>

            {onSignOut && (
              <button
                onClick={onSignOut}
                className="bg-red-100 hover:bg-red-200 text-red-600 p-2 rounded-lg transition-colors"
                title="Sign Out"
              >
                <span className="material-symbols-outlined">logout</span>
              </button>
            )}
          </div>
        </div>

        {/* Project Info Pill */}
        {projectTitle && (
          <div className="px-6 pb-4">
            <div className="inline-flex items-center gap-2 bg-[#895af6] text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-md">
              <span className="material-symbols-outlined text-sm">folder</span>
              {projectTitle}
            </div>
          </div>
        )}

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="material-symbols-outlined animate-spin">
                  progress_activity
                </span>
                <span className="text-sm">Loading conversation...</span>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">
                chat
              </span>
              <p className="text-sm text-slate-400">
                Start a conversation with Harvey!
              </p>
            </div>
          )}

          {/* Messages — useChat messages + appended feedback, with optional widgets */}
          {!isLoading &&
            displayMessages.map((message, index) => {
              const text = message.content
              const fromUseChat = index < messages.length
              const uiMsg = fromUseChat ? messages[index] : null
              const showToolCall =
                uiMsg && message.role === 'assistant' && hasToolCall(uiMsg)

              return (
                <div
                  key={message.id}
                  className={`flex flex-col gap-2 max-w-[85%] ${
                    message.role === 'user' ? 'self-end items-end' : ''
                  }`}
                >
                  {text ? (
                    <>
                      <div
                        className={`p-4 rounded-2xl shadow-sm ${
                          message.role === 'user'
                            ? 'bg-[#895af6] text-white rounded-tr-none shadow-md'
                            : 'bg-white rounded-tl-none border border-white/50'
                        }`}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
                      </div>
                      {showToolCall && (
                        <div className="flex items-center gap-1 ml-1 text-[10px] text-emerald-600 font-medium">
                          <span className="material-symbols-outlined text-xs">check_circle</span>
                          Action completed
                        </div>
                      )}
                    </>
                  ) : null}
                  {message.widget && projectId ? (
                    <div className="ml-1">
                      {message.widget.type === 'completion_feedback' &&
                      message.widget.data &&
                      'taskId' in message.widget.data ? (
                        <CompletionFeedbackWidget
                          taskId={String(message.widget.data.taskId)}
                          projectId={projectId}
                          onAppendMessage={handleAppendMessage}
                          onTasksChanged={onTasksChanged}
                        />
                      ) : null}
                      {message.widget.type === 'skip_feedback' &&
                      message.widget.data &&
                      'taskId' in message.widget.data ? (
                        <SkipFeedbackWidget
                          taskId={String(message.widget.data.taskId)}
                          projectId={projectId}
                          onAppendMessage={handleAppendMessage}
                          onTasksChanged={onTasksChanged}
                        />
                      ) : null}
                      {message.widget.type === 'reschedule_prompt' &&
                      message.widget.data &&
                      'taskId' in message.widget.data &&
                      'suggestedDate' in message.widget.data &&
                      'suggestedTime' in message.widget.data ? (
                        <ReschedulePromptWidget
                          taskId={String(message.widget.data.taskId)}
                          suggestedDate={String(message.widget.data.suggestedDate)}
                          suggestedTime={String(message.widget.data.suggestedTime)}
                          onAppendMessage={(role, content) => handleAppendMessage(role, content)}
                          onTasksChanged={onTasksChanged}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  <span
                    className={`text-[10px] text-slate-500 uppercase font-bold tracking-wider ${
                      message.role === 'user' ? 'mr-1' : 'ml-1'
                    }`}
                  >
                    {message.role === 'user' ? 'You' : 'Harvey'}
                  </span>
                </div>
              )
            })}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex flex-col gap-2 max-w-[85%]">
              <div className="p-4 rounded-2xl bg-white rounded-tl-none border border-white/50 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-[#895af6] rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-[#895af6] rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-[#895af6] rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          {/* Auto-scroll anchor */}
          <div ref={chatEndRef} />
        </div>

        {/* Active Chat Input */}
        <div className="p-6 border-t border-black/5 bg-white/20">
          <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder={projectId ? 'Ask Harvey anything...' : 'Loading project...'}
              disabled={!projectId || isTyping}
              rows={1}
              className="flex-1 bg-white/50 border border-white/30 rounded-xl py-3 pl-4 pr-3 text-sm shadow-inner resize-none focus:outline-none focus:ring-2 focus:ring-[#895af6]/30 focus:border-[#895af6]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ maxHeight: '120px' }}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isTyping || !projectId}
              className="bg-[#895af6] hover:bg-[#7849d9] text-white p-3 rounded-xl transition-colors shadow-md disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <span className="material-symbols-outlined text-lg">send</span>
            </button>
          </form>
        </div>
      </aside>

      {/* --- CONFIRMATION MODAL --- */}
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
    </>
  )
}
