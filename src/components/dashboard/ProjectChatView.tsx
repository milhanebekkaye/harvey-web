/**
 * ProjectChatView — Sidebar content when project chat is active.
 *
 * Contains: project pill, project context chip, constraint/check-in error,
 * message list (useChat), and input. Rebuild modal lives here.
 * All existing project chat behavior is preserved; Step 2 will add any new logic here.
 */

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import type { ChatWidget } from '@/types/api.types'
import { CompletionFeedbackWidget } from './chat/CompletionFeedbackWidget'
import { SkipFeedbackWidget } from './chat/SkipFeedbackWidget'
import { ReschedulePromptWidget } from './chat/ReschedulePromptWidget'

interface StoredMsg {
  role: 'assistant' | 'user'
  content: string
  timestamp: string
  widget?: ChatWidget
  messageType?: 'check-in'
}

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  widget?: ChatWidget
  messageType?: 'check-in'
}

export interface ProjectChatViewProps {
  initialMessages: StoredMsg[]
  projectTitle?: string
  projectId: string | null
  isLoading?: boolean
  onTasksChanged?: () => void
  onAppendMessage?: (role: 'user' | 'assistant', content: string, widget?: ChatWidget) => void
  appendedByParent?: Array<Omit<DisplayMessage, 'createdAt'> & { createdAt?: string }>
  streamingCheckIn?: string | null
  checkInError?: string | null
  onTestCheckIn?: (timeOfDay: 'morning' | 'afternoon' | 'evening') => void
}

function storedToUIMessages(stored: StoredMsg[]): UIMessage[] {
  return stored
    .filter((m) => !m.content.includes('PROJECT_INTAKE_COMPLETE'))
    .map((m, i) => ({
      id: `stored-${i}`,
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

function hasToolCall(msg: UIMessage): boolean {
  if (!msg.parts) return false
  return msg.parts.some(
    (p) =>
      typeof p.type === 'string' &&
      (p.type.startsWith('tool-') || p.type === 'dynamic-tool')
  )
}

function anyAssistantMessageHasToolCall(messages: UIMessage[]): boolean {
  return messages.some((m) => m.role === 'assistant' && hasToolCall(m))
}

export function ProjectChatView({
  initialMessages,
  projectTitle,
  projectId,
  isLoading = false,
  onTasksChanged,
  onAppendMessage: parentOnAppendMessage,
  appendedByParent = [],
  streamingCheckIn = null,
  checkInError = null,
  onTestCheckIn,
}: ProjectChatViewProps) {
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

  const [appendedFeedbackMessages, setAppendedFeedbackMessages] = useState<
    DisplayMessage[]
  >([])
  const [inputValue, setInputValue] = useState('')

  const handleAppendMessage = useCallback(
    (role: 'user' | 'assistant', content: string, widget?: ChatWidget) => {
      const id = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const createdAt = new Date().toISOString()
      setAppendedFeedbackMessages((prev) => [
        ...prev,
        { id, role, content, createdAt, widget },
      ])
      parentOnAppendMessage?.(role, content, widget)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    },
    [parentOnAppendMessage]
  )

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
      if (anyAssistantMessageHasToolCall(finishedMessages)) {
        onTasksChanged?.()
      }
    },
  })

  const isTyping = status === 'streaming' || status === 'submitted'

  useEffect(() => {
    if (chatError) {
      const raw = chatError?.message ?? String(chatError)
      try {
        const parsed = JSON.parse(raw) as {
          error?: string
          code?: string
          details?: string
        }
        console.error(
          '[ProjectChatView] useChat error:',
          parsed.error ?? raw,
          parsed.details ? `\n${parsed.details}` : ''
        )
      } catch {
        console.error('[ProjectChatView] useChat error:', raw)
      }
    }
  }, [chatError])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping, appendedFeedbackMessages, appendedByParent, streamingCheckIn])

  const displayMessages: DisplayMessage[] = [
    ...messages.map((msg, i) => ({
      id: msg.id || `msg-${i}`,
      role: msg.role as 'user' | 'assistant',
      content: getTextFromParts(msg),
      createdAt:
        i < initialMessages.length
          ? initialMessages[i].timestamp
          : new Date().toISOString(),
      widget: i < initialMessages.length ? initialMessages[i].widget : undefined,
      messageType:
        i < initialMessages.length ? initialMessages[i].messageType : undefined,
    })),
    ...appendedByParent.map((m) => ({
      ...m,
      createdAt: m.createdAt ?? new Date().toISOString(),
    })),
    ...appendedFeedbackMessages,
    ...(streamingCheckIn != null
      ? [
          {
            id: 'checkin-streaming',
            role: 'assistant' as const,
            content: streamingCheckIn,
            createdAt: new Date().toISOString(),
            messageType: 'check-in' as const,
          },
        ]
      : []),
  ]
    .filter((m) => m.content || m.widget)
    .sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
    )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isTyping || !projectId) return
    sendMessage({ text: inputValue })
    setInputValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  return (
    <>
      {/* Header (Harvey AI + purple pill) is in ChatSidebar; here only messages + input */}
      {/* Check-in error */}
      {checkInError && (
        <div className="mx-6 mb-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-red-700 text-xs">
          {checkInError}
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="flex items-center gap-2 text-slate-400">
              <span className="material-symbols-outlined animate-spin">
                progress_activity
              </span>
              <span className="text-sm">Loading conversation...</span>
            </div>
          </div>
        )}

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

        {!isLoading &&
          displayMessages.map((message) => {
            const text = message.content
            const uiMsg = messages.find((m) => (m.id || '') === message.id)
            const showToolCall =
              uiMsg && message.role === 'assistant' && hasToolCall(uiMsg)
            return (
              <div
                key={message.id}
                className={`flex flex-col gap-2 max-w-[85%] ${
                  message.role === 'user' ? 'self-end items-end' : ''
                }`}
                {...(message.messageType === 'check-in'
                  ? { 'data-message-type': 'check-in' }
                  : {})}
              >
                {text ? (
                  <>
                    {message.messageType === 'check-in' && (
                      <span className="ml-1 text-[10px] text-[#62499c] font-medium uppercase tracking-wider">
                        Check-in
                      </span>
                    )}
                    <div
                      className={`p-4 rounded-2xl shadow-sm ${
                        message.role === 'user'
                          ? 'bg-[#895af6] text-white rounded-tr-none shadow-md'
                          : message.messageType === 'check-in'
                            ? 'bg-[#895af6]/5 rounded-tl-none border border-[#895af6]/20 border-l-4 border-l-[#895af6]/50'
                            : 'bg-white rounded-tl-none border border-white/50'
                      }`}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {text}
                      </p>
                    </div>
                    {showToolCall && (
                      <div className="flex items-center gap-1 ml-1 text-[10px] text-emerald-600 font-medium">
                        <span className="material-symbols-outlined text-xs">
                          check_circle
                        </span>
                        Action completed
                      </div>
                    )}
                  </>
                ) : null}
                {message.widget && projectId ? (
                  <div className="ml-1">
                    {message.widget.type === 'completion_feedback' &&
                      message.widget.data &&
                      'taskId' in message.widget.data && (
                        <CompletionFeedbackWidget
                          taskId={String(message.widget.data.taskId)}
                          projectId={projectId}
                          onAppendMessage={handleAppendMessage}
                          onTasksChanged={onTasksChanged}
                        />
                      )}
                    {message.widget.type === 'skip_feedback' &&
                      message.widget.data &&
                      'taskId' in message.widget.data && (
                        <SkipFeedbackWidget
                          taskId={String(message.widget.data.taskId)}
                          projectId={projectId}
                          onAppendMessage={handleAppendMessage}
                          onTasksChanged={onTasksChanged}
                        />
                      )}
                    {message.widget.type === 'reschedule_prompt' &&
                      message.widget.data &&
                      'taskId' in message.widget.data &&
                      'suggestedDate' in message.widget.data &&
                      'suggestedTime' in message.widget.data && (
                        <ReschedulePromptWidget
                          taskId={String(message.widget.data.taskId)}
                          suggestedDate={String(
                            message.widget.data.suggestedDate
                          )}
                          suggestedTime={String(
                            message.widget.data.suggestedTime
                          )}
                          onAppendMessage={(role, content) =>
                            handleAppendMessage(role, content)
                          }
                          onTasksChanged={onTasksChanged}
                        />
                      )}
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

        {streamingCheckIn !== null && streamingCheckIn === '' && (
          <div
            className="flex flex-col gap-2 max-w-[85%]"
            aria-live="polite"
          >
            <span className="ml-1 text-[10px] text-[#62499c] font-medium uppercase tracking-wider">
              Check-in
            </span>
            <div className="p-4 rounded-2xl bg-[#895af6]/5 rounded-tl-none border border-[#895af6]/20 shadow-sm">
              <p className="text-sm text-slate-500">Harvey is saying hi…</p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="w-2 h-2 bg-[#895af6] rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-[#895af6] rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-[#895af6] rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

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
            placeholder={
              projectId ? 'Ask Harvey anything...' : 'Loading project...'
            }
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
    </>
  )
}
