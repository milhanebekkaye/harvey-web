/**
 * Onboarding Page
 *
 * Chat-style onboarding where Harvey asks questions to understand:
 * - What project the user is working on
 * - Their availability and schedule constraints
 * - Their work preferences (morning/evening, rest days, capacity)
 *
 * Architecture:
 * - Uses Vercel AI SDK useChat for streaming (Harvey's messages appear word-by-word)
 * - Messages are stored in state and persisted to database via API
 * - Connects to POST /api/chat (streaming endpoint)
 *
 * Flow: User chats with Harvey -> Harvey gathers info -> "Build my schedule" -> /loading
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

// Import all onboarding components from the centralized index
import {
  ChatMessageList,
  OnboardingProgress,
  OnboardingHeader,
  OnboardingCTA,
  ChatInput,
  ProjectShadowPanel,
} from '@/components/onboarding'

// Import types and helper functions for messages
import type { ChatMessage } from '@/types/chat.types'
import type { UIMessage } from 'ai'
import { COMPLETION_MARKER } from '@/lib/ai/prompts'

/**
 * Harvey's initial greeting message
 *
 * This is shown immediately when the page loads.
 * It's the same message Harvey would send, but we show it
 * client-side for instant feedback.
 */
const INITIAL_GREETING =
  "Hey! I'm Harvey, your AI project coach. I'm here to turn \"I want to build something\" into \"Here's exactly what to do today.\" Let's start with the basics - what project are you working on? Be as precise as you can so I can help you best!"

/**
 * User information for displaying in chat
 *
 * TODO: Get this from authenticated user's profile
 */
const USER_INFO = {
  name: 'User',
  initial: 'U',
}

/** Extract text content from UIMessage parts */
function getTextFromUIMessage(msg: UIMessage): string {
  if (!msg.parts) return ''
  return msg.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

/** Convert UIMessage to ChatMessage for display */
function uiMessageToChatMessage(msg: UIMessage): ChatMessage {
  let content = getTextFromUIMessage(msg)
  // Strip completion marker from display (server also cleans before saving)
  if (content.includes(COMPLETION_MARKER)) {
    content = content.replace(COMPLETION_MARKER, '').trim()
  }
  const isStreaming = msg.role === 'assistant'
  return {
    id: msg.id ?? crypto.randomUUID(),
    role: msg.role as 'assistant' | 'user',
    content,
    timestamp: new Date(),
    status: isStreaming && content ? 'streaming' : 'complete',
  }
}

/** Initial messages for useChat - Harvey's greeting */
const INITIAL_MESSAGES: UIMessage[] = [
  {
    id: 'harvey-greeting',
    role: 'assistant',
    parts: [{ type: 'text' as const, text: INITIAL_GREETING }],
  },
]

export default function OnboardingPage() {
  const router = useRouter()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const projectIdRef = useRef<string | null>(null)

  const [projectId, setProjectId] = useState<string | null>(null)
  const [isComplete, setIsComplete] = useState(false)

  const [shadowFields, setShadowFields] = useState<{
    user: Record<string, unknown>
    project: Record<string, unknown>
  } | null>(null)
  const [extractionLoading, setExtractionLoading] = useState(false)

  const triggerExtraction = async (currentProjectId: string) => {
    console.log('[OnboardingExtraction] Starting extraction for project:', currentProjectId)
    setExtractionLoading(true)
    try {
      const response = await fetch('/api/onboarding/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ projectId: currentProjectId }),
      })
      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Extraction failed: ${response.status} ${errText}`)
      }
      const result = await response.json()
      const extracted = result.extracted ?? { user: result.user, project: result.project }
      const saved = result.saved ?? null
      console.log('[OnboardingExtraction] Extraction completed:', result)
      console.log('[OnboardingExtraction] User fields:', extracted?.user)
      console.log('[OnboardingExtraction] Project fields:', extracted?.project)
      console.log('[OnboardingExtraction] Saved to DB:', saved)
      if (extracted && (extracted.user != null || extracted.project != null)) {
        setShadowFields({
          user: extracted.user ?? {},
          project: extracted.project ?? {},
        })
      }
    } catch (err) {
      console.error('[OnboardingExtraction] Extraction failed:', err)
    } finally {
      setExtractionLoading(false)
    }
  }

  const { messages, sendMessage, status, error } = useChat({
    messages: INITIAL_MESSAGES,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: () => ({
        projectId: projectIdRef.current ?? undefined,
        context: 'onboarding',
      }),
    }),
    onData: (dataPart) => {
      console.log('[OnboardingChat] onData received:', dataPart)
      const typed = dataPart as { type?: string; data?: { projectId?: string } }
      if (typed.type === 'data-onboarding-meta' && typed.data?.projectId) {
        const pid = typed.data.projectId
        projectIdRef.current = pid
        setProjectId(pid)
        console.log('[OnboardingChat] projectId set from stream:', pid)
      }
    },
    onFinish: ({ messages: finishedMessages }) => {
      const lastAssistant = [...finishedMessages]
        .reverse()
        .find((m) => m.role === 'assistant')
      if (lastAssistant) {
        const text = getTextFromUIMessage(lastAssistant)
        console.log('[OnboardingChat] Stream finished, Harvey responded:', text.substring(0, 100) + (text.length > 100 ? '...' : ''))
        if (text.includes(COMPLETION_MARKER)) {
          setIsComplete(true)
        }
      }
      const currentProjectId = projectIdRef.current ?? projectId
      console.log('[OnboardingChat] onFinish: projectIdRef.current =', projectIdRef.current, ', projectId state =', projectId, ', will trigger extraction =', !!currentProjectId)
      if (currentProjectId) {
        console.log('[OnboardingChat] Triggering extraction...')
        triggerExtraction(currentProjectId).catch((err) => {
          console.error('[OnboardingChat] Background extraction error:', err)
        })
      } else {
        console.log('[OnboardingChat] No projectId yet, skipping extraction')
      }
    },
  })

  const isTyping = status === 'streaming' || status === 'submitted'

  /**
   * Progress percentage for the progress bar
   */
  const calculateProgress = (): number => {
    if (isComplete) return 100
    const userCount = messages.filter((m) => m.role === 'user').length
    if (userCount === 0) return 0
    return Math.min(90, userCount * 10)
  }

  const progressPercentage = calculateProgress()

  // ===== EFFECTS =====

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // ===== EVENT HANDLERS =====

  const handleSendMessage = (content: string) => {
    console.log('[OnboardingChat] User sent message:', content)
    sendMessage({ text: content })
  }

  const handleBuildSchedule = async () => {
    router.push(`/loading?projectId=${projectId}`)
  }

  // ===== DERIVED STATE =====

  const displayMessages: ChatMessage[] = messages.map(uiMessageToChatMessage)

  return (
    <div className="relative flex h-screen w-full flex-col overflow-x-hidden bg-[#FAF9F6]">
      <OnboardingProgress
        percentage={progressPercentage}
        isComplete={isComplete}
      />

      <div className="flex flex-1 min-h-0">
        {/* Chat section – 40% */}
        <div className="flex w-[40%] flex-col border-r border-gray-200/80">
          <div className="flex-1 flex flex-col overflow-y-auto px-4 py-6">
            <div className="mx-auto w-full max-w-[600px] flex flex-col gap-6">
              {isComplete && (
                <OnboardingHeader
                  badgeText="Success"
                  headline="The finish line is just the beginning."
                  highlightText="the beginning."
                />
              )}

              <ChatMessageList
                messages={displayMessages}
                userInitial={USER_INFO.initial}
              />

              {isTyping && (
                <div className="flex items-center gap-2 text-[#8B5CF6]/60 text-sm">
                  <span className="material-symbols-outlined text-lg animate-pulse">
                    more_horiz
                  </span>
                  <span>Harvey is typing...</span>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">
                  {error.message}
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          </div>

          {isComplete ? (
            <OnboardingCTA onClick={handleBuildSchedule} isLoading={false} />
          ) : (
            <ChatInput
              onSend={handleSendMessage}
              isLoading={isTyping}
              placeholder="Type your answer..."
              autoFocus
            />
          )}
        </div>

        {/* Shadow panel – 60% */}
        <div className="w-[60%] min-w-0 flex flex-col">
          <ProjectShadowPanel fields={shadowFields} isLoading={extractionLoading} />
        </div>
      </div>

      <div className="fixed top-[-10%] left-[-5%] w-[40%] h-[40%] bg-[#8B5CF6]/5 rounded-full blur-[100px] -z-10" />
      <div className="fixed bottom-[-10%] right-[-5%] w-[30%] h-[30%] bg-[#8B5CF6]/10 rounded-full blur-[80px] -z-10" />
    </div>
  )
}
