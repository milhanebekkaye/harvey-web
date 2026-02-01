/**
 * Onboarding Page
 *
 * Chat-style onboarding where Harvey asks questions to understand:
 * - What project the user is working on
 * - Their availability and schedule constraints
 * - Their work preferences (morning/evening, rest days, capacity)
 *
 * Architecture:
 * - Uses modular components from @/components/onboarding
 * - Messages are stored in state and persisted to database
 * - Connects to POST /api/chat for AI responses
 *
 * Flow: User chats with Harvey -> Harvey gathers info -> "Build my schedule" -> /loading
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// Import all onboarding components from the centralized index
import {
  ChatMessageList,
  OnboardingProgress,
  OnboardingHeader,
  OnboardingCTA,
  ChatInput,
} from '@/components/onboarding'

// Import types and helper functions for messages
import type { ChatMessage } from '@/lib/types/chat.types'
import { harveyMessage, userMessage } from '@/lib/types/chat.types'
import type { ChatResponse } from '@/lib/types/api.types'

/**
 * Harvey's initial greeting message
 *
 * This is shown immediately when the page loads.
 * It's the same message Harvey would send, but we show it
 * client-side for instant feedback.
 */
const INITIAL_GREETING =
  "Hey! I'm Harvey, your AI project coach. I'm here to turn \"I want to build something\" into \"Here's exactly what to do today.\" Let's start with the basics - what project are you working on?"

/**
 * User information for displaying in chat
 *
 * TODO: Get this from authenticated user's profile
 * - Fetch user's name from Supabase auth or database
 * - Compute initial from first letter of name
 */
const USER_INFO = {
  name: 'User',
  initial: 'U',
}

export default function OnboardingPage() {
  const router = useRouter()
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ===== STATE MANAGEMENT =====

  /**
   * Chat messages state
   *
   * Initialized with Harvey's greeting, then updated as
   * conversation progresses.
   */
  const [messages, setMessages] = useState<ChatMessage[]>([])

  /**
   * Project ID for the current conversation
   *
   * - null: First message hasn't been sent yet
   * - string: Conversation in progress, use this to continue
   */
  const [projectId, setProjectId] = useState<string | null>(null)

  /**
   * Whether Harvey is currently typing/generating a response
   */
  const [isTyping, setIsTyping] = useState(false)

  /**
   * Conversation completion state
   *
   * Set to true when API returns isComplete: true
   * (Harvey has gathered all needed info)
   */
  const [isComplete, setIsComplete] = useState(false)

  /**
   * Error message if something goes wrong
   */
  const [error, setError] = useState<string | null>(null)

  /**
   * Loading state for the CTA button
   * Shows spinner when user clicks "Build my schedule"
   */
  const [isBuilding, setIsBuilding] = useState(false)

  /**
   * Progress percentage for the progress bar
   *
   * Logic:
   * - Start at 0% (before first user message)
   * - Increase ~10% per message exchange (user + Harvey)
   * - Cap at 90% before completion (even if conversation is long)
   * - Jump to 100% when isComplete is true
   *
   * We count user messages (excluding Harvey's initial greeting)
   * Each user message = one exchange = 10% progress
   */
  const calculateProgress = (): number => {
    if (isComplete) {
      return 100
    }

    // Count only user messages (Harvey's greeting doesn't count as progress)
    const userMessageCount = messages.filter((m) => m.role === 'user').length

    if (userMessageCount === 0) {
      return 0 // No progress until user sends first message
    }

    // 10% per user message, capped at 90%
    // This ensures we don't hit 100% until isComplete is true
    return Math.min(90, userMessageCount * 10)
  }

  const progressPercentage = calculateProgress()

  // ===== EFFECTS =====

  /**
   * Initialize with Harvey's greeting on mount
   */
  useEffect(() => {
    setMessages([harveyMessage(INITIAL_GREETING)])
  }, [])

  /**
   * Auto-scroll to bottom when messages change
   */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // ===== EVENT HANDLERS =====

  /**
   * Handle new message from user
   *
   * Called when user submits a message via ChatInput.
   *
   * Flow:
   * 1. Add user message to state immediately (optimistic update)
   * 2. Send to /api/chat
   * 3. Add Harvey's response
   * 4. Check if conversation is complete
   */
  const handleSendMessage = async (content: string) => {
    // Clear any previous error
    setError(null)

    // Add user message to state immediately (optimistic update)
    const newUserMessage = userMessage(content)
    setMessages((prev) => [...prev, newUserMessage])

    // Show typing indicator
    setIsTyping(true)

    try {
      console.log('[OnboardingPage] Sending message to API')

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          projectId: projectId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send message')
      }

      const data: ChatResponse = await response.json()
      console.log('[OnboardingPage] Response received:', {
        isComplete: data.isComplete,
        projectId: data.projectId,
      })

      // Update projectId if this was first message
      if (!projectId) {
        setProjectId(data.projectId)
        console.log('[OnboardingPage] Project created:', data.projectId)
      }

      // Add Harvey's response
      setMessages((prev) => [...prev, harveyMessage(data.response)])

      // Check for completion
      if (data.isComplete) {
        console.log('[OnboardingPage] Conversation complete!')
        setIsComplete(true)
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong'
      console.error('[OnboardingPage] Chat error:', errorMessage)
      setError(errorMessage)

      // Add error message to chat
      const errorChatMessage = harveyMessage(
        "Sorry, I'm having trouble connecting. Please try again."
      )
      errorChatMessage.status = 'error'
      setMessages((prev) => [...prev, errorChatMessage])
    } finally {
      setIsTyping(false)
    }
  }

  /**
   * Handle "Build my schedule" button click
   *
   * Called when user clicks the CTA button after completing onboarding.
   * Navigates to the loading page where AI generates the schedule.
   */
  const handleBuildSchedule = async () => {
    try {
      setIsBuilding(true)
      console.log('[OnboardingPage] Building schedule, navigating to loading...')
      console.log('[OnboardingPage] Project ID:', projectId)

      // Navigate to loading page with projectId
      router.push(`/loading?projectId=${projectId}`)
    } catch (err) {
      console.error('[OnboardingPage] Navigation error:', err)
      setIsBuilding(false)
    }
  }

  // ===== RENDER =====

  return (
    <div className="relative flex h-screen w-full flex-col overflow-x-hidden bg-[#FAF9F6]">
      {/*
        Progress Header
        Shows current step and completion percentage
      */}
      <OnboardingProgress
        percentage={progressPercentage}
        isComplete={isComplete}
      />

      {/* Main Chat Area - Scrollable */}
      <div className="flex-1 flex flex-col items-center justify-start px-4 py-10 overflow-y-auto">
        <div className="w-full max-w-[700px] flex flex-col gap-6">
          {/*
            Success Header
            Only shown when conversation is complete
            Displays celebratory message before CTA
          */}
          {isComplete && (
            <OnboardingHeader
              badgeText="Success"
              headline="The finish line is just the beginning."
              highlightText="the beginning."
            />
          )}

          {/*
            Chat Conversation
            Renders all messages using the ChatMessageList component
            Each message is displayed with appropriate styling for Harvey or user
          */}
          <ChatMessageList
            messages={messages}
            userInitial={USER_INFO.initial}
          />

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex items-center gap-2 text-[#8B5CF6]/60 text-sm">
              <span className="material-symbols-outlined text-lg animate-pulse">
                more_horiz
              </span>
              <span>Harvey is typing...</span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/*
        Bottom Section
        Shows either:
        - CTA button when conversation is complete
        - ChatInput when conversation is ongoing
      */}
      {isComplete ? (
        // Show CTA button when onboarding conversation is complete
        <OnboardingCTA onClick={handleBuildSchedule} isLoading={isBuilding} />
      ) : (
        // Show ChatInput when conversation is ongoing
        <ChatInput
          onSend={handleSendMessage}
          isLoading={isTyping}
          placeholder="Type your answer..."
          autoFocus
        />
      )}

      {/* Background Gradient Decorations - Purely aesthetic */}
      <div className="fixed top-[-10%] left-[-5%] w-[40%] h-[40%] bg-[#8B5CF6]/5 rounded-full blur-[100px] -z-10" />
      <div className="fixed bottom-[-10%] right-[-5%] w-[30%] h-[30%] bg-[#8B5CF6]/10 rounded-full blur-[80px] -z-10" />
    </div>
  )
}
