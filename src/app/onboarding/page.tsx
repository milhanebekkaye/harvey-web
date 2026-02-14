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

/**
 * Calculate completion progress based on weighted importance of extracted fields.
 * Returns 0–100 percentage.
 */
function calculateExtractionProgress(fields: { user: Record<string, unknown>; project: Record<string, unknown> } | null): number {
  if (!fields) return 0
  const weights = {
    title: 5,
    description_or_goals: 5,
    availability: 10,
    weekly_hours: 5,
    deadline: 8,
    project_type: 5,
    skill_level: 7,
    tools_and_stack: 6,
    motivation: 6,
    phases: 8,
    workSchedule: 8,
    commute: 3,
    preferred_session_length: 4,
    communication_style: 3,
    timezone: 3,
    userNotes: 4,
    projectNotes: 5,
  }
  let score = 0
  const p = fields.project
  const u = fields.user
  if (p?.title) score += weights.title
  if (p?.description || p?.goals) score += weights.description_or_goals
  if (u?.availabilityWindows && Array.isArray(u.availabilityWindows) && (u.availabilityWindows as unknown[]).length > 0) score += weights.availability
  if (p?.weekly_hours_commitment != null && Number(p.weekly_hours_commitment) > 0) score += weights.weekly_hours
  if (p?.target_deadline) score += weights.deadline
  if (p?.project_type) score += weights.project_type
  if (p?.skill_level) score += weights.skill_level
  if (p?.tools_and_stack && Array.isArray(p.tools_and_stack) && (p.tools_and_stack as unknown[]).length > 0) score += weights.tools_and_stack
  if (p?.motivation) score += weights.motivation
  if (p?.phases != null && typeof p.phases === 'object') score += weights.phases
  if (u?.workSchedule != null && typeof u.workSchedule === 'object') score += weights.workSchedule
  if (u?.commute != null && typeof u.commute === 'object') score += weights.commute
  if (u?.preferred_session_length != null) score += weights.preferred_session_length
  if (u?.communication_style) score += weights.communication_style
  if (u?.timezone) score += weights.timezone
  if (u?.userNotes != null) score += weights.userNotes
  if (p?.projectNotes != null) score += weights.projectNotes
  return Math.min(100, Math.round(score))
}

/** Check if minimum required fields are present to allow building a schedule. */
function hasMinimumFields(fields: { user: Record<string, unknown>; project: Record<string, unknown> } | null): boolean {
  if (!fields) return false
  const p = fields.project
  const u = fields.user
  const hasTitle = !!(p?.title && String(p.title).trim())
  const hasDescriptionOrGoals = !!(p?.description && String(p.description).trim()) || !!(p?.goals && String(p.goals).trim())
  const hasAvailability = !!(u?.availabilityWindows && Array.isArray(u.availabilityWindows) && (u.availabilityWindows as unknown[]).length > 0)
  const hasWeeklyHours = !!(p?.weekly_hours_commitment != null && Number(p.weekly_hours_commitment) > 0)
  return hasTitle && hasDescriptionOrGoals && hasAvailability && hasWeeklyHours
}

export default function OnboardingPage() {
  const router = useRouter()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const projectIdRef = useRef<string | null>(null)

  const [projectId, setProjectId] = useState<string | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [hasCompletionMarker, setHasCompletionMarker] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

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
          console.log('[OnboardingChat] ✓ Completion marker detected - Harvey is ready!')
          setIsComplete(true)
          setHasCompletionMarker(true)
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

  // ===== EFFECTS =====

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // ===== EVENT HANDLERS =====

  const handleSendMessage = (content: string) => {
    console.log('[OnboardingChat] User sent message:', content)
    sendMessage({ text: content })
  }

  const handleStage1Click = () => {
    console.log('[BuildSchedule] Stage 1 clicked - showing confirmation')
    setShowConfirmModal(true)
  }

  const handleBuildSchedule = () => {
    console.log('[BuildSchedule] Building schedule with projectId:', projectId)
    setShowConfirmModal(false)
    if (!projectId) {
      console.error('[BuildSchedule] No projectId available')
      return
    }
    router.push(`/loading?projectId=${projectId}`)
  }

  const handleKeepChatting = () => {
    console.log('[BuildSchedule] User chose to keep chatting')
    setShowConfirmModal(false)
  }

  const extractionProgress = calculateExtractionProgress(shadowFields)
  const canBuild = hasMinimumFields(shadowFields)
  const isReady = extractionProgress >= 80 || hasCompletionMarker

  // ===== DERIVED STATE =====

  const displayMessages: ChatMessage[] = messages.map(uiMessageToChatMessage)

  /** Build Schedule button: disabled / Stage 1 (confirm) / Stage 2 (direct). */
  const BuildScheduleButton = () => {
    if (!canBuild) {
      return (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            disabled
            className="w-full rounded-xl bg-gray-300 px-4 py-3 text-base font-medium text-gray-500 cursor-not-allowed"
          >
            Build My Schedule
          </button>
          <p className="text-center text-sm text-gray-500">Answer Harvey&apos;s questions first</p>
        </div>
      )
    }
    if (isReady) {
      return (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={handleBuildSchedule}
            className="w-full rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] px-4 py-3 text-base font-medium text-white shadow-lg shadow-[#8B5CF6]/25 hover:from-[#7C3AED] hover:to-[#6D28D9]"
          >
            Build My Schedule ✨
          </button>
          <p className="text-center text-sm text-[#8B5CF6]">Harvey is ready!</p>
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={handleStage1Click}
          className="w-full rounded-xl bg-[#8B5CF6] px-4 py-3 text-base font-medium text-white hover:bg-[#7C3AED]"
        >
          Build Schedule
        </button>
        <p className="flex items-center justify-center gap-1.5 text-center text-sm text-amber-600">
          <span className="text-base">⚠️</span>
          Better results with more info
        </p>
      </div>
    )
  }

  /** Confirmation modal when user clicks Build in Stage 1. */
  const ConfirmationModal = () => {
    if (!showConfirmModal) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={handleKeepChatting}>
        <div
          className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold text-gray-900">Build schedule now?</h3>
          <p className="mt-2 text-sm text-gray-600">
            Harvey recommends answering a few more questions for the best schedule. You can build now with current
            info, but more details = better results.
          </p>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-sm text-gray-600">
              <span>Information gathered:</span>
              <span>{extractionProgress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-[#8B5CF6] transition-all"
                style={{ width: `${extractionProgress}%` }}
              />
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleKeepChatting}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
            >
              Keep Chatting
            </button>
            <button
              type="button"
              onClick={handleBuildSchedule}
              className="flex-1 rounded-lg bg-[#8B5CF6] px-4 py-2 font-medium text-white hover:bg-[#7C3AED]"
            >
              Build Anyway
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-screen w-full flex-col overflow-x-hidden bg-[#FAF9F6]">
      <div className="flex flex-1 min-h-0">
        {/* Chat section – 40% */}
        <div className="flex w-[40%] flex-col border-r border-gray-200/80">
          <header className="shrink-0 border-b border-gray-200/80 bg-[#FAF9F6] px-4 py-4">
            <h1 className="text-lg font-semibold text-gray-900">Harvey</h1>
            <p className="text-sm text-gray-500">Your AI project coach</p>
          </header>
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
        <div className="flex w-[60%] min-w-0 flex-col">
          <div className="flex-1 min-h-0 overflow-hidden">
            <ProjectShadowPanel
              fields={shadowFields}
              isLoading={extractionLoading}
              progress={extractionProgress}
              projectId={projectId}
              onFieldUpdate={(scope, field, value) => {
                setShadowFields((prev) => {
                  if (!prev) return prev
                  if (scope === 'user') {
                    return { ...prev, user: { ...prev.user, [field]: value } }
                  }
                  return { ...prev, project: { ...prev.project, [field]: value } }
                })
              }}
            />
          </div>
          <div className="shrink-0 border-t border-gray-200/80 bg-[#FAF9F6] p-4">
            <BuildScheduleButton />
          </div>
        </div>
      </div>

      <ConfirmationModal />

      <div className="fixed top-[-10%] left-[-5%] w-[40%] h-[40%] bg-[#8B5CF6]/5 rounded-full blur-[100px] -z-10" />
      <div className="fixed bottom-[-10%] right-[-5%] w-[30%] h-[30%] bg-[#8B5CF6]/10 rounded-full blur-[80px] -z-10" />
    </div>
  )
}
