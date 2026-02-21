/**
 * TaskChatView — Sidebar content when a task chat is active.
 *
 * Loads discussion from API on mount; shows messages and enabled input when
 * discussion exists. User messages are persisted; Harvey does not respond in Step 2
 * (placeholder "Harvey is thinking..." for 1.5s). Step 3 will plug in real streaming here.
 *
 * Recently opened task conversations are kept in an in-memory cache so switching
 * back to a task chat is instant (no loading spinner). Data is still fetched in the
 * background to stay in sync.
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface StoredMsg {
  role: 'assistant' | 'user'
  content: string
  timestamp: string
}

const TASK_CHAT_CACHE_MAX = 20

type TaskChatCacheEntry = {
  discussionId: string | null
  messages: StoredMsg[]
  state: 'loaded' | 'not_created'
}

/** In-memory cache of last opened task discussions for instant display when switching back. */
const taskChatCache = new Map<string, TaskChatCacheEntry>()

function getCached(taskId: string): TaskChatCacheEntry | undefined {
  return taskChatCache.get(taskId)
}

function setCached(taskId: string, entry: TaskChatCacheEntry): void {
  if (taskChatCache.size >= TASK_CHAT_CACHE_MAX && !taskChatCache.has(taskId)) {
    const firstKey = taskChatCache.keys().next().value
    if (firstKey != null) taskChatCache.delete(firstKey)
  }
  taskChatCache.set(taskId, entry)
}

interface TaskChatViewProps {
  taskId: string
  projectId: string | null
  taskTitle: string
  taskLabel: string
  /** When set, we already have a discussion; mount GET still loads latest messages. */
  initialDiscussionId?: string
  /** When we just created the discussion (POST response), pass messages so the opening message shows immediately. */
  initialMessages?: Array<{ role: string; content: string; timestamp: string }>
  onBackToProject: () => void
}

export function TaskChatView({
  taskId,
  projectId,
  taskTitle,
  taskLabel,
  initialDiscussionId,
  initialMessages,
  onBackToProject,
}: TaskChatViewProps) {
  const cached = getCached(taskId)
  const [messages, setMessages] = useState<StoredMsg[]>(() => cached?.messages ?? [])
  const [discussionId, setDiscussionId] = useState<string | null>(() => cached?.discussionId ?? null)
  const [discussionState, setDiscussionState] = useState<'loaded' | 'not_created'>(
    () => (cached ? cached.state : 'not_created')
  )
  const [sendError, setSendError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [showTypingIndicator, setShowTypingIndicator] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // When parent passes discussion + messages from POST create, show them immediately (real opening message)
  useEffect(() => {
    if (
      initialDiscussionId &&
      initialMessages &&
      initialMessages.length > 0 &&
      discussionState === 'not_created' &&
      messages.length === 0
    ) {
      const msgs: StoredMsg[] = initialMessages.map((m) => ({
        role: m.role as 'assistant' | 'user',
        content: m.content,
        timestamp: m.timestamp,
      }))
      setMessages(msgs)
      setDiscussionId(initialDiscussionId)
      setDiscussionState('loaded')
      setCached(taskId, {
        discussionId: initialDiscussionId,
        messages: msgs,
        state: 'loaded',
      })
    }
  }, [initialDiscussionId, initialMessages, taskId, discussionState, messages.length])

  // Load discussion on mount: show cache or placeholder immediately, then fetch in background
  useEffect(() => {
    if (!projectId) {
      setDiscussionState('not_created')
      setMessages([])
      setDiscussionId(null)
      return
    }
    const cachedEntry = getCached(taskId)
    if (cachedEntry) {
      setMessages(cachedEntry.messages)
      setDiscussionId(cachedEntry.discussionId)
      setDiscussionState(cachedEntry.state)
    } else {
      setMessages([])
      setDiscussionId(null)
      setDiscussionState('not_created')
    }
    setSendError(null)

    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(
          `/api/discussions/task?taskId=${encodeURIComponent(taskId)}`
        )
        if (cancelled) return
        if (!res.ok) {
          setDiscussionState('not_created')
          setMessages([])
          setDiscussionId(null)
          setCached(taskId, {
            discussionId: null,
            messages: [],
            state: 'not_created',
          })
          return
        }
        const data = await res.json()
        const disc = data.discussion
        if (disc && Array.isArray(disc.messages)) {
          setMessages(disc.messages)
          setDiscussionId(disc.id)
          setDiscussionState('loaded')
          setCached(taskId, {
            discussionId: disc.id,
            messages: disc.messages,
            state: 'loaded',
          })
        } else {
          setMessages([])
          setDiscussionId(null)
          setDiscussionState('not_created')
          setCached(taskId, {
            discussionId: null,
            messages: [],
            state: 'not_created',
          })
        }
      } catch {
        if (!cancelled) {
          setDiscussionState('not_created')
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [taskId, projectId])

  // Placeholder typing indicator: show for 1.5s then hide (Step 3 will replace with real Harvey response)
  useEffect(() => {
    if (!showTypingIndicator) return
    const t = setTimeout(() => {
      setShowTypingIndicator(false)
      setIsSending(false)
    }, 1500)
    return () => clearTimeout(t)
  }, [showTypingIndicator])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const content = inputValue.trim()
      if (!content || isSending || showTypingIndicator) return
      if (!discussionId) {
        setSendError('Open this task chat from the timeline first.')
        return
      }
      setSendError(null)
      const userMessage: StoredMsg = {
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMessage])
      setInputValue('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      setIsSending(true)
      setShowTypingIndicator(true)

      try {
        const res = await fetch('/api/discussions/task/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ discussionId, content }),
        })
        if (!res.ok) {
          setSendError('Failed to save message. Try again.')
          setShowTypingIndicator(false)
          setIsSending(false)
          return
        }
        // Success: update cache so next time we open this task it shows the new message instantly
        setMessages((prev) => {
          setCached(taskId, {
            discussionId,
            messages: prev,
            state: 'loaded',
          })
          return prev
        })
        // Typing indicator will clear after 1.5s via effect. No Harvey reply in Step 2.
        // Step 3: replace the timeout above with a real streaming call and append assistant message.
      } catch {
        setSendError('Failed to save message. Try again.')
        setShowTypingIndicator(false)
        setIsSending(false)
      }
    },
    [inputValue, discussionId, isSending, showTypingIndicator]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  // While opening message is loading (first time): show Harvey typing indicator only
  const isLoadingOpening =
    discussionState === 'not_created' && messages.length === 0 && projectId != null
  const showHarveyTyping = isLoadingOpening || showTypingIndicator

  const canSend = Boolean(discussionId && !isSending && !showTypingIndicator)

  return (
    <>
      {/* Back link */}
      <div className="px-6 pt-2 pb-1">
        <button
          type="button"
          onClick={onBackToProject}
          className="text-sm text-[#895af6] hover:text-[#7849d9] font-medium flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Back to project chat
        </button>
      </div>

      {/* Chat area — messages or Harvey typing (opening or reply) */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {messages.map((msg, idx) => (
          <div
            key={`${msg.timestamp}-${idx}`}
            className={`flex flex-col gap-2 max-w-[85%] ${
              msg.role === 'user' ? 'self-end items-end ml-auto' : ''
            }`}
          >
            <div
              className={`p-4 rounded-2xl shadow-sm ${
                msg.role === 'user'
                  ? 'bg-[#895af6] text-white rounded-tr-none shadow-md'
                  : 'bg-white rounded-tl-none border border-white/50'
              }`}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </p>
            </div>
            <span
              className={`text-[10px] text-slate-500 uppercase font-bold tracking-wider ${
                msg.role === 'user' ? 'mr-1' : 'ml-1'
              }`}
            >
              {msg.role === 'user' ? 'You' : 'Harvey'}
            </span>
          </div>
        ))}

        {/* Harvey is typing... (opening message loading or reply placeholder) */}
        {showHarveyTyping && (
          <div className="flex flex-col gap-2 max-w-[85%]">
            <div className="p-4 rounded-2xl bg-white rounded-tl-none border border-white/50 shadow-sm">
              <p className="text-xs text-slate-500 mb-2">Harvey is typing...</p>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-[#895af6] rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-[#895af6] rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-[#895af6] rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Inline error */}
      {sendError && (
        <div className="mx-6 mb-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-red-700 text-xs">
          {sendError}
        </div>
      )}

      {/* Input bar — enabled when discussion exists */}
      <div className="p-6 border-t border-black/5 bg-white/20">
        <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              const el = e.target
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 120) + 'px'
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              !discussionId
                ? 'Open this chat from the timeline to send messages.'
                : 'Ask Harvey about this task...'
            }
            disabled={!canSend}
            rows={1}
            className="flex-1 bg-white/50 border border-white/30 rounded-xl py-3 pl-4 pr-3 text-sm shadow-inner resize-none focus:outline-none focus:ring-2 focus:ring-[#895af6]/30 focus:border-[#895af6]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ maxHeight: '120px' }}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || !canSend}
            className="bg-[#895af6] hover:bg-[#7849d9] text-white p-3 rounded-xl transition-colors shadow-md disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center justify-center"
          >
            {isSending ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <span className="material-symbols-outlined text-lg">send</span>
            )}
          </button>
        </form>
      </div>
    </>
  )
}
