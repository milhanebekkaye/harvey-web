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

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'


// Import all onboarding components from the centralized index
import {
  ChatMessageList,
  OnboardingHeader,
  OnboardingCTA,
  ChatInput,
  ProjectShadowPanel,
  DatePickerWidget,
  OnboardingErrorBoundary,
} from '@/components/onboarding'
import type { DatePickerField } from '@/components/onboarding'

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

/** Check if a user message content looks like a date-picker answer (so we treat widget as answered on restore). */
function isDatePickerAnswer(content: string): boolean {
  const t = content.trim().toLowerCase()
  return t.startsWith('my deadline is ') || t.startsWith('my start date is ')
}

/** Extract show_date_picker invocation from recent assistant messages. Searches last 5 assistant messages and checks multiple AI SDK part formats. */
function getShowDatePickerInvocation(
  messages: UIMessage[]
): { messageId: string; field: DatePickerField; label: string; min_date: string } | null {
  const recentAssistant = messages
    .filter((m) => m.role === 'assistant')
    .slice(-5)
    .reverse()
  const todayStr = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)

  for (const msg of recentAssistant) {
    const parts = (msg as { parts?: unknown[] }).parts ?? []
    if (process.env.NODE_ENV === 'development') {
      console.log('[getShowDatePickerInvocation] checking msg', msg.id, 'parts types:', parts.map((p: unknown) => (p as { type?: string }).type))
    }
    for (const part of parts) {
      const p = part as {
        type?: string
        toolName?: string
        toolInvocation?: { toolName?: string; args?: Record<string, unknown> }
        args?: Record<string, unknown>
        input?: Record<string, unknown>
      }
      const isShowDatePicker =
        p.type === 'tool-invocation' ||
        p.type === 'tool_use' ||
        p.type === 'tool-show_date_picker' ||
        (typeof p.type === 'string' && p.type.startsWith('tool') && p.toolName === 'show_date_picker') ||
        p.toolInvocation?.toolName === 'show_date_picker'
      if (!isShowDatePicker) continue
      const args = p.args ?? p.input ?? p.toolInvocation?.args ?? {}
      const field = args.field === 'deadline' || args.field === 'start_date' ? (args.field as DatePickerField) : 'deadline'
      const label = typeof args.label === 'string' ? args.label : (field === 'deadline' ? 'Select your project deadline' : 'Select your schedule start date')
      const min_date = typeof args.min_date === 'string' ? args.min_date : field === 'deadline' ? tomorrowStr : todayStr
      return {
        messageId: msg.id ?? '',
        field,
        label,
        min_date,
      }
    }
  }
  return null
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

/** Convert stored discussion messages to UIMessage[] for useChat (e.g. after restore). */
function storedToUIMessages(stored: Array<{ role: string; content: string }>): UIMessage[] {
  return stored.map((m, i) => {
    let content = m.content ?? ''
    if (content.includes(COMPLETION_MARKER)) {
      content = content.replace(COMPLETION_MARKER, '').trim()
    }
    return {
      id: `stored-${i}-${m.role}`,
      role: m.role as 'user' | 'assistant',
      parts: [{ type: 'text' as const, text: content }],
    }
  })
}

/** True only when phases has actual content (non-empty array, or object with phases array, or phase_* keys). Empty {} or [] returns false. */
function hasPhasesContentForProgress(raw: unknown): boolean {
  if (raw == null) return false
  if (Array.isArray(raw)) return raw.length > 0
  if (typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  if (Array.isArray(o.phases)) return o.phases.length > 0
  return Object.keys(o).some((k) => k.startsWith('phase_'))
}

/**
 * Calculate field completeness (0–100) from weighted extracted fields.
 * Used only internally for the 40% minimum threshold; user never sees this number.
 */
function calculateFieldCompleteness(fields: { user: Record<string, unknown>; project: Record<string, unknown> } | null): number {
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
    energy_peak: 3,
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
  // Phases: only count if there is actual content (array with items, or object with phases array, or phase_1/phase_2 keys)
  if (hasPhasesContentForProgress(p?.phases)) score += weights.phases
  if (u?.workSchedule != null && typeof u.workSchedule === 'object') score += weights.workSchedule
  if (u?.commute != null && typeof u.commute === 'object') score += weights.commute
  if (u?.preferred_session_length != null) score += weights.preferred_session_length
  if (u?.communication_style) score += weights.communication_style
  if (u?.timezone) score += weights.timezone
  if (u?.userNotes != null) score += weights.userNotes
  if (p?.projectNotes != null) score += weights.projectNotes
  if (u?.energy_peak != null && String(u.energy_peak).trim() !== '') score += weights.energy_peak
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

interface OnboardingChatContentProps {
  initialMessages: UIMessage[]
  initialProjectId: string | null
  /** When restoring, pass stored project/user from DB so we skip the extraction API call. */
  initialExtracted?: { user: Record<string, unknown>; project: Record<string, unknown> } | null
}

function OnboardingChatContent({ initialMessages, initialProjectId, initialExtracted }: OnboardingChatContentProps) {
  const router = useRouter()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const projectIdRef = useRef<string | null>(initialProjectId)

  const [projectId, setProjectId] = useState<string | null>(initialProjectId)
  const [isComplete, setIsComplete] = useState(false)
  const [hasCompletionMarker, setHasCompletionMarker] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const [shadowFields, setShadowFields] = useState<{
    user: Record<string, unknown>
    project: Record<string, unknown>
  } | null>(initialExtracted ?? null)
  const [harveyConfidence, setHarveyConfidence] = useState(0)
  const [maxHarveyConfidence, setMaxHarveyConfidence] = useState(0)
  const [missingBlockingFields, setMissingBlockingFields] = useState<string[]>([])
  const [extractionLoading, setExtractionLoading] = useState(false)
  const [answeredWidgetIds, setAnsweredWidgetIds] = useState<Set<string>>(new Set())
  const harveyConfidenceRef = useRef(0)
  const maxHarveyConfidenceRef = useRef(0)
  useEffect(() => {
    harveyConfidenceRef.current = harveyConfidence
  }, [harveyConfidence])
  useEffect(() => {
    maxHarveyConfidenceRef.current = maxHarveyConfidence
  }, [maxHarveyConfidence])

  const RECAP_PHRASES = [
    'check the panel',
    'i think i have everything',
    "hit 'build my schedule'",
    'ready to build',
  ]

  const triggerExtraction = useCallback(async (currentProjectId: string, messageCount?: number) => {
    console.log('[OnboardingExtraction] Starting extraction for project:', currentProjectId)
    setExtractionLoading(true)
    try {
      const previousConfidence = harveyConfidenceRef.current
      const response = await fetch('/api/onboarding/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          projectId: currentProjectId,
          previousConfidence,
        }),
      })
      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Extraction failed: ${response.status} ${errText}`)
      }
      const result = await response.json()
      const extracted = result.extracted ?? { user: result.user, project: result.project }
      const saved = result.saved ?? null
      const confidence = typeof result.completion_confidence === 'number'
        ? Math.min(75, Math.max(0, Math.round(result.completion_confidence)))
        : 0
      const displayed = Math.max(maxHarveyConfidenceRef.current, confidence)
      const floorApplied = confidence < maxHarveyConfidenceRef.current
      console.log(
        `[Harvey Confidence] message #${messageCount ?? '?'} → new: ${confidence}, displayed: ${displayed}, floor_applied: ${floorApplied}`
      )
      const blocking: string[] = Array.isArray(result.missingBlockingFields)
        ? result.missingBlockingFields
        : []
      setMissingBlockingFields(blocking)
      const nextFields = extracted && (extracted.user != null || extracted.project != null)
        ? { user: extracted.user ?? {}, project: extracted.project ?? {} }
        : null
      const fieldCompletenessPct = nextFields ? calculateFieldCompleteness(nextFields) : 0
      const buttonState =
        fieldCompletenessPct < 40
          ? 'DISABLED (need ≥40% field completeness)'
          : blocking.length > 0
            ? 'DISABLED (blocking fields missing)'
            : confidence >= 80
              ? 'STAGE 2 (Harvey ready)'
              : 'STAGE 1 (can build, more info recommended)'
      console.log('[OnboardingExtraction] ─── Completion summary ───')
      console.log('[OnboardingExtraction] Field completeness:', fieldCompletenessPct + '%', '| Harvey confidence:', confidence + '%', '| Button:', buttonState)
      console.log('[OnboardingExtraction] Saved to DB:', saved ? { user: !!saved.user, project: !!saved.project } : null)
      console.log('[OnboardingExtraction] ──────────────────────────')
      setHarveyConfidence((prev) => (prev >= 80 ? prev : confidence))
      setMaxHarveyConfidence((prev) => {
        const newMax = Math.max(prev, confidence)
        if (confidence < prev) {
          console.log(`[Harvey Confidence] Decrease suppressed: ${confidence} (showing ${prev})`)
        }
        return newMax
      })
      if (nextFields) {
        setShadowFields(nextFields)
      }
    } catch (err) {
      console.error('[OnboardingExtraction] Extraction failed:', err)
    } finally {
      setExtractionLoading(false)
    }
  }, [])

  // Only sync projectId from props when we have a non-null initialProjectId (restore case).
  // Never overwrite projectIdRef with null once the stream has set it (onData), or every
  // subsequent message would omit projectId and the server would create a new project.
  useEffect(() => {
    if (initialProjectId != null) {
      projectIdRef.current = initialProjectId
      setProjectId(initialProjectId)
    }
    if (initialProjectId) {
      if (initialExtracted) {
        setShadowFields(initialExtracted)
      } else {
        triggerExtraction(initialProjectId).catch((err) => {
          console.error('[OnboardingRestore] Extraction after restore failed:', err)
        })
      }
    }
  }, [initialProjectId, initialExtracted, triggerExtraction])

  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: () => ({
        projectId: projectIdRef.current ?? undefined,
        context: 'onboarding',
        currentConfidence: harveyConfidenceRef.current,
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
      let text = ''
      if (lastAssistant) {
        text = getTextFromUIMessage(lastAssistant)
        console.log('[OnboardingChat] Stream finished, Harvey responded:', text.substring(0, 100) + (text.length > 100 ? '...' : ''))
        if (text.includes(COMPLETION_MARKER)) {
          console.log('[OnboardingChat] ✓ Completion marker detected - Harvey is ready!')
          setIsComplete(true)
          setHasCompletionMarker(true)
        }
        const messageText = text.toLowerCase()
        const harveyIsReady = RECAP_PHRASES.some((phrase) => messageText.includes(phrase))
        if (harveyIsReady && harveyConfidenceRef.current < 80) {
          console.log(`[Harvey Confidence] Harvey gave recap at ${harveyConfidenceRef.current}% → forcing to 80`)
          setHarveyConfidence(80)
          setMaxHarveyConfidence((prev) => Math.max(prev, 80))
        }
      }
      const currentProjectId = projectIdRef.current ?? projectId
      console.log('[OnboardingChat] onFinish: projectIdRef.current =', projectIdRef.current, ', projectId state =', projectId, ', will trigger extraction =', !!currentProjectId)
      if (currentProjectId) {
        console.log('[OnboardingChat] Triggering extraction...')
        triggerExtraction(currentProjectId, finishedMessages?.length).catch((err) => {
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

  /** Date picker: mark widget answered immediately, then append user message (onboarding only). */
  const handleDateSelected = useCallback(
    (messageId: string, field: DatePickerField, dateStr: string) => {
      setAnsweredWidgetIds((prev) => new Set(prev).add(messageId))
      const label = field === 'deadline' ? 'deadline' : 'start date'
      const content = `My ${label} is ${dateStr}`
      sendMessage({ text: content })
    },
    [sendMessage]
  )

  const fieldCompleteness = calculateFieldCompleteness(shadowFields)
  const canBuild =
    fieldCompleteness >= 40 && (missingBlockingFields?.length ?? 0) === 0
  const isReady = canBuild && (harveyConfidence >= 80 || hasCompletionMarker)
  if (process.env.NODE_ENV === 'development' && (shadowFields || harveyConfidence > 0)) {
    console.log('[Onboarding] Field completeness:', fieldCompleteness + '%', "| Harvey's confidence:", harveyConfidence + '%', '| missingBlocking:', missingBlockingFields?.length ?? 0)
  }

  // ===== DERIVED STATE =====

  const displayMessages: ChatMessage[] = messages.map(uiMessageToChatMessage)

  const lastMessage = messages[messages.length - 1]
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant')
  const datePickerInvocation = getShowDatePickerInvocation(messages)

  if (process.env.NODE_ENV === 'development') {
    messages.forEach((msg) => {
      if (msg.role === 'assistant') {
        console.log('[onboarding/page] assistant message id:', msg.id)
        console.log('[onboarding/page] message parts:', JSON.stringify((msg as { parts?: unknown }).parts ?? [], null, 2))
        console.log('[onboarding/page] message content type:', typeof (msg as { content?: unknown }).content)
      }
    })
    console.log('[onboarding/page] datePickerInvocation:', datePickerInvocation)
    console.log('[onboarding/page] lastAssistantMessage id:', lastAssistantMessage?.id)
  }

  const lastAssistantText = lastAssistantMessage ? getTextFromUIMessage(lastAssistantMessage) : ''
  const hasUserSentMessage = messages.some((m) => m.role === 'user')
  // Only match when Harvey is asking a question about dates (question mark + date-related term). Skip fallback on initial load (no user message yet).
  // Deadline: also match "when do you want ... ready", "lock in a timeline", "ready to share" (e.g. beta launch date).
  const isAskingAboutDeadline =
    hasUserSentMessage &&
    lastAssistantText.includes('?') &&
    /when.*deadline|what.*deadline|deadline.*when|when.*finish|when.*due|target.*date.*\?|what.*date.*finish|when.*ready|ready.*when|when.*timeline|lock.*timeline|ready to share|what.*ready/i.test(lastAssistantText)
  // Start date: require explicit calendar phrasing (start date, begin, kick off, begin scheduling); match "What's your start date", etc.
  const isAskingAboutStartDate =
    hasUserSentMessage &&
    lastAssistantText.includes('?') &&
    /when.*begin|when.*kick|start\s+date|schedule\s+start|when.*start\s+date|what.*start\s+date|what'?s your start date|kick\s*off|begin.*when|begin scheduling/i.test(lastAssistantText)
  const tomorrowStr = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const todayStr = new Date().toISOString().slice(0, 10)
  const projectData = shadowFields?.project as { target_deadline?: unknown; schedule_start_date?: unknown } | undefined
  const deadlineAlreadySet = !!(projectData?.target_deadline != null && projectData?.target_deadline !== '')
  // Don't suppress start-date widget based on extraction: show when Harvey asks; rely on answeredWidgetIds after user picks
  const startDateAlreadySet = false
  let forcedDatePickerField: DatePickerField | null = null
  if (!datePickerInvocation) {
    if (!deadlineAlreadySet && isAskingAboutDeadline) forcedDatePickerField = 'deadline'
    else if (!startDateAlreadySet && isAskingAboutStartDate) forcedDatePickerField = 'start_date'
  }

  const effectiveDatePickerConfig =
    datePickerInvocation ??
    (forcedDatePickerField && lastAssistantMessage?.id
      ? {
          messageId: lastAssistantMessage.id,
          field: forcedDatePickerField,
          label: forcedDatePickerField === 'deadline' ? 'Select your project deadline' : 'Select your schedule start date',
          min_date: forcedDatePickerField === 'deadline' ? tomorrowStr : todayStr,
        }
      : null)
  const datePickerAnswered = effectiveDatePickerConfig ? answeredWidgetIds.has(effectiveDatePickerConfig.messageId) : false
  const showDatePickerWidget = effectiveDatePickerConfig != null && !datePickerAnswered

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
              <span>Harvey&apos;s confidence:</span>
              <span>{maxHarveyConfidence}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-[#8B5CF6] transition-all"
                style={{ width: `${maxHarveyConfidence}%` }}
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

              {showDatePickerWidget && effectiveDatePickerConfig && (
                <DatePickerWidget
                  field={effectiveDatePickerConfig.field}
                  label={effectiveDatePickerConfig.label}
                  minDate={effectiveDatePickerConfig.min_date}
                  onSelect={(dateStr) =>
                    handleDateSelected(effectiveDatePickerConfig.messageId, effectiveDatePickerConfig.field, dateStr)
                  }
                  answered={datePickerAnswered}
                />
              )}

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
              disabled={showDatePickerWidget}
              placeholder={showDatePickerWidget ? 'Pick a date above to continue' : 'Type your answer...'}
              autoFocus
            />
          )}
        </div>

        {/* Shadow panel – 60% */}
        <div className="flex w-[60%] min-w-0 flex-col">
          <div className="flex-1 min-h-0 overflow-hidden">
            <OnboardingErrorBoundary
              fallback={
                <div className="p-4 text-sm text-gray-500">Panel error — please refresh</div>
              }
            >
              <ProjectShadowPanel
                fields={shadowFields}
                isLoading={extractionLoading}
                harveyConfidence={maxHarveyConfidence}
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
            </OnboardingErrorBoundary>
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

function OnboardingPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [restoringSession, setRestoringSession] = useState(true)
  const [restoreData, setRestoreData] = useState<{
    projectId: string
    messages: UIMessage[]
    extracted?: { user: Record<string, unknown>; project: Record<string, unknown> }
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    const projectIdFromUrl = searchParams.get('projectId')
    const url = projectIdFromUrl
      ? `/api/onboarding/restore?projectId=${encodeURIComponent(projectIdFromUrl)}`
      : '/api/onboarding/restore'
    fetch(url, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.completed) {
          router.replace('/dashboard')
          return
        }
        if (data.restore && data.projectId && Array.isArray(data.messages)) {
          setRestoreData({
            projectId: data.projectId,
            messages: storedToUIMessages(data.messages),
            extracted: data.extracted ?? undefined,
          })
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('[OnboardingRestore] Restore failed:', err)
      })
      .finally(() => {
        if (!cancelled) setRestoringSession(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; URL projectId read once
  }, [router])

  if (restoringSession) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#FAF9F6]">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined animate-spin text-4xl text-[#8B5CF6]">progress_activity</span>
          <p className="text-sm text-gray-600">Loading your conversation...</p>
        </div>
      </div>
    )
  }

  const initialMessages = restoreData ? restoreData.messages : INITIAL_MESSAGES
  const initialProjectId = restoreData ? restoreData.projectId : null
  const initialExtracted = restoreData?.extracted ?? null
  return (
    <OnboardingChatContent
      key={initialProjectId ?? 'new'}
      initialMessages={initialMessages}
      initialProjectId={initialProjectId}
      initialExtracted={initialExtracted}
    />
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-[#FAF9F6]">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined animate-spin text-4xl text-[#8B5CF6]">progress_activity</span>
          <p className="text-sm text-gray-600">Loading your conversation...</p>
        </div>
      </div>
    }>
      <OnboardingPageInner />
    </Suspense>
  )
}