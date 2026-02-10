/**
 * Chat Type Definitions
 *
 * Types for the chat system used in onboarding and future AI conversations.
 * These types are designed to be flexible for AI integration later.
 */

import type { ChatWidget } from './api.types'

/**
 * Who sent the message
 * - 'assistant': Harvey (the AI bot)
 * - 'user': The human user
 */
export type MessageRole = 'assistant' | 'user'

/**
 * Status of a message (useful for AI streaming and loading states)
 * - 'sending': Message is being sent to AI
 * - 'streaming': AI is currently generating this message
 * - 'complete': Message is fully received/sent
 * - 'error': Message failed to send/receive
 */
export type MessageStatus = 'sending' | 'streaming' | 'complete' | 'error'

/**
 * A single chat message
 *
 * Used for displaying messages in the chat UI.
 * Designed to work with both hardcoded messages and AI-generated ones.
 * Optional widget for embedded feedback/reschedule UI (Feature 3).
 */
export interface ChatMessage {
  /**
   * Unique identifier for the message
   * Use crypto.randomUUID() or similar to generate
   */
  id: string

  /**
   * Who sent this message: 'assistant' (Harvey) or 'user'
   */
  role: MessageRole

  /**
   * The message content (text)
   * For AI: This will be the streamed/completed response
   */
  content: string

  /**
   * When the message was created
   * Useful for sorting and displaying timestamps
   */
  timestamp: Date

  /**
   * Current status of the message
   * Default: 'complete' for static messages
   */
  status?: MessageStatus

  /**
   * Optional embedded widget (completion/skip feedback, reschedule prompt)
   */
  widget?: ChatWidget
}

/**
 * User information for displaying in chat
 *
 * Used to personalize the chat (avatar initial, name)
 */
export interface ChatUser {
  /**
   * User's display name (e.g., "Milhane")
   */
  name: string

  /**
   * First letter of name, used for avatar
   * Will be computed from name if not provided
   */
  initial?: string
}

/**
 * Props for sending a new message
 *
 * Used by ChatInput component when user submits a message
 */
export interface SendMessageData {
  /**
   * The message text to send
   */
  content: string
}

/**
 * Conversation state for the onboarding chat
 *
 * Tracks the full conversation and current state
 */
export interface ConversationState {
  /**
   * All messages in the conversation
   */
  messages: ChatMessage[]

  /**
   * Is Harvey currently typing/generating a response?
   */
  isTyping: boolean

  /**
   * Has the user completed the onboarding conversation?
   * True when Harvey has gathered all needed info
   */
  isComplete: boolean

  /**
   * Any error that occurred during the conversation
   */
  error?: string
}

/**
 * Onboarding progress tracking
 *
 * Tracks what information has been gathered during onboarding
 */
export interface OnboardingProgress {
  /**
   * Progress percentage (0-100)
   */
  percentage: number

  /**
   * Current step label (e.g., "Project Details", "Availability")
   */
  currentStep: string

  /**
   * Whether onboarding is complete
   */
  isComplete: boolean
}

/**
 * Data collected during onboarding
 *
 * This is what we extract from the conversation to create the user's schedule
 * Future: AI will populate this from the conversation
 */
export interface OnboardingData {
  /**
   * User's project description
   */
  projectDescription?: string

  /**
   * User's work schedule (e.g., "9am-5:30pm")
   */
  workSchedule?: string

  /**
   * User's commute time
   */
  commuteTime?: string

  /**
   * User's available hours per day
   */
  availableHours?: string

  /**
   * Preferred work time (morning/evening)
   */
  preferredTime?: 'morning' | 'evening' | 'flexible'

  /**
   * Days user wants to keep light/rest
   */
  restDays?: string[]

  /**
   * Any other commitments (workout, family, etc.)
   */
  otherCommitments?: string[]
}

/**
 * Helper function to create a new message
 *
 * @param role - Who is sending: 'assistant' or 'user'
 * @param content - The message text
 * @returns A complete ChatMessage object
 */
export function createMessage(
  role: MessageRole,
  content: string
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: new Date(),
    status: 'complete',
  }
}

/**
 * Helper function to create Harvey's message
 *
 * @param content - What Harvey says
 * @returns A ChatMessage from Harvey
 */
export function harveyMessage(content: string): ChatMessage {
  return createMessage('assistant', content)
}

/**
 * Helper function to create user's message
 *
 * @param content - What the user says
 * @returns A ChatMessage from the user
 */
export function userMessage(content: string): ChatMessage {
  return createMessage('user', content)
}
