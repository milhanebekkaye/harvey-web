/**
 * TaskChatView — Sidebar content when a task chat is active.
 *
 * Loads discussion from API on mount; shows messages and input when discussion exists.
 * Uses useChat with POST /api/chat/task for streaming Harvey responses. User and
 * assistant messages are persisted by the API. Recently opened task conversations
 * are kept in an in-memory cache so switching back is instant.
 */

'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'

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

function storedToUIMessages(stored: StoredMsg[]): UIMessage[] {
  return stored.map((m, i) => ({
    id: `stored-${i}-${m.timestamp}`,
    role: m.role as 'user' | 'assistant',
    parts: [{ type: 'text' as const, text: m.content }],
  }))
}

function getTextFromParts(msg: UIMessage): string {
  if (!msg.parts) return ''
  return msg.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

function areMessagesEquivalent(a: UIMessage, b: UIMessage): boolean {
  return a.role === b.role && getTextFromParts(a) === getTextFromParts(b)
}

function isMessagePrefix(prefix: UIMessage[], full: UIMessage[]): boolean {
  if (prefix.length > full.length) return false
  for (let i = 0; i < prefix.length; i += 1) {
    if (!areMessagesEquivalent(prefix[i], full[i])) return false
  }
  return true
}

function mergeSeedIntoChatMessages(current: UIMessage[], seed: UIMessage[]): UIMessage[] {
  if (seed.length === 0) return current
  if (current.length === 0) return seed
  if (isMessagePrefix(seed, current)) return current
  if (isMessagePrefix(current, seed)) return seed
  return [...seed, ...current]
}

interface TaskChatViewProps {
  taskId: string
  projectId: string | null
  taskTitle: string
  taskLabel: string
  initialDiscussionId?: string
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
  const [discussionId, setDiscussionId] = useState<string | null>(() => cached?.discussionId ?? null)
  const [discussionState, setDiscussionState] = useState<'loaded' | 'not_created'>(
    () => (cached ? cached.state : 'not_created')
  )
  const [seedMessages, setSeedMessages] = useState<StoredMsg[]>(() => cached?.messages ?? [])
  const [sendError, setSendError] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  /** Set when we apply initialMessages from parent (POST create); prevents load effect from wiping them when GET returns late */
  const receivedInitialFromParentRef = useRef(false)

  const uiSeedMessages = useMemo(() => storedToUIMessages(seedMessages), [seedMessages])

  const { messages, setMessages, sendMessage, status } = useChat({
    id: `task-chat-${taskId}-${projectId ?? 'none'}`,
    messages: uiSeedMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat/task',
      body: () => ({
        taskId,
        projectId: projectId ?? undefined,
      }),
    }),
    onFinish: ({ messages: finishedMessages }) => {
      const asStored: StoredMsg[] = finishedMessages.map((m) => ({
        role: m.role as 'assistant' | 'user',
        content: getTextFromParts(m),
        timestamp: new Date().toISOString(),
      }))
      setCached(taskId, {
        discussionId: discussionId ?? null,
        messages: asStored,
        state: 'loaded',
      })
    },
  })

  const isTyping = status === 'streaming' || status === 'submitted'
  const renderedMessages = useMemo(
    () => mergeSeedIntoChatMessages(messages, uiSeedMessages),
    [messages, uiSeedMessages]
  )

  // When parent passes discussion + messages from POST create, show them immediately
  useEffect(() => {
    if (
      initialDiscussionId &&
      initialMessages &&
      initialMessages.length > 0 &&
      discussionState === 'not_created' &&
      seedMessages.length === 0
    ) {
      receivedInitialFromParentRef.current = true
      const msgs: StoredMsg[] = initialMessages.map((m) => ({
        role: m.role as 'assistant' | 'user',
        content: m.content,
        timestamp: m.timestamp,
      }))
      setSeedMessages(msgs)
      setDiscussionId(initialDiscussionId)
      setDiscussionState('loaded')
      setCached(taskId, {
        discussionId: initialDiscussionId,
        messages: msgs,
        state: 'loaded',
      })
    }
  }, [initialDiscussionId, initialMessages, taskId, discussionState, seedMessages.length])

  // Load discussion on mount: show cache or placeholder, then fetch in background
  useEffect(() => {
    receivedInitialFromParentRef.current = false
    if (!projectId) {
      setDiscussionState('not_created')
      setSeedMessages([])
      setDiscussionId(null)
      return
    }
    const cachedEntry = getCached(taskId)
    if (cachedEntry) {
      setSeedMessages(cachedEntry.messages)
      setDiscussionId(cachedEntry.discussionId)
      setDiscussionState(cachedEntry.state)
    } else {
      setSeedMessages([])
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
        // If we already received initial messages from parent (POST create), don't overwrite when GET fails or returns null (race)
        if (receivedInitialFromParentRef.current) return
        if (!res.ok) {
          setDiscussionState('not_created')
          setSeedMessages([])
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
          setSeedMessages(disc.messages)
          setDiscussionId(disc.id)
          setDiscussionState('loaded')
          setCached(taskId, {
            discussionId: disc.id,
            messages: disc.messages,
            state: 'loaded',
          })
        } else {
          if (!receivedInitialFromParentRef.current) {
            setSeedMessages([])
            setDiscussionId(null)
            setDiscussionState('not_created')
            setCached(taskId, {
              discussionId: null,
              messages: [],
              state: 'not_created',
            })
          }
        }
      } catch {
        if (!cancelled && !receivedInitialFromParentRef.current) {
          setDiscussionState('not_created')
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [taskId, projectId])

  // Poll for discussion when we're waiting for it (e.g. just created via POST). Shows opening message as soon as DB has it.
  useEffect(() => {
    if (
      !projectId ||
      !taskId ||
      discussionState !== 'not_created' ||
      seedMessages.length > 0
    ) {
      return
    }
    const POLL_INTERVAL_MS = 800
    const MAX_ATTEMPTS = 25
    let attempts = 0
    let cancelled = false
    const poll = async () => {
      if (cancelled || attempts >= MAX_ATTEMPTS) return
      attempts += 1
      try {
        const res = await fetch(
          `/api/discussions/task?taskId=${encodeURIComponent(taskId)}`
        )
        if (cancelled) return
        if (!res.ok) return
        const data = await res.json()
        const disc = data.discussion
        if (disc && Array.isArray(disc.messages) && disc.messages.length > 0) {
          const msgs: StoredMsg[] = disc.messages.map(
            (m: { role: string; content: string; timestamp: string }) => ({
              role: m.role as 'assistant' | 'user',
              content: m.content,
              timestamp: m.timestamp,
            })
          )
          setSeedMessages(msgs)
          setDiscussionId(disc.id)
          setDiscussionState('loaded')
          setCached(taskId, {
            discussionId: disc.id,
            messages: msgs,
            state: 'loaded',
          })
          return
        }
      } catch {
        // ignore, will retry
      }
      if (!cancelled && attempts < MAX_ATTEMPTS) {
        timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS)
      }
    }
    let timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [taskId, projectId, discussionState, seedMessages.length])

  // useChat reads initial messages once; sync in opening/seeded messages that arrive later.
  useEffect(() => {
    if (status === 'submitted' || status === 'streaming') return
    if (renderedMessages === messages) return
    setMessages(renderedMessages)
  }, [messages, renderedMessages, setMessages, status])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const content = inputValue.trim()
      if (!content || isTyping || !discussionId || !projectId) return
      setSendError(null)
      sendMessage({ text: content })
      setInputValue('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    },
    [inputValue, isTyping, discussionId, projectId, sendMessage]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  const isLoadingOpening =
    discussionState === 'not_created' && seedMessages.length === 0 && projectId != null
  const showHarveyTyping = isLoadingOpening || isTyping

  const canSend = Boolean(discussionId && projectId && !isTyping)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [renderedMessages, isTyping])

  return (
    <>
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

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {renderedMessages.map((msg, idx) => (
          <div
            key={msg.id ?? `msg-${idx}`}
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
                {getTextFromParts(msg)}
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

      {sendError && (
        <div className="mx-6 mb-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-red-700 text-xs">
          {sendError}
        </div>
      )}

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
            {isTyping ? (
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
