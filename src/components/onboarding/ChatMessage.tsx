/**
 * ChatMessage Component
 *
 * Displays a single chat message bubble with avatar.
 * Handles both Harvey (AI) messages and user messages with different styles.
 *
 * Layout:
 * - Harvey: Avatar on left, message bubble aligned left
 * - User: Message bubble aligned right, avatar on right
 *
 * Future AI Integration:
 * - Supports 'streaming' status for typewriter effect
 * - Supports 'sending' status for loading indicator
 * - Supports 'error' status for retry functionality
 */

'use client'

import type { ChatMessage as ChatMessageType } from '@/types/chat.types'
import { ChatAvatar } from './ChatAvatar'

interface ChatMessageProps {
  /**
   * The message data to display
   */
  message: ChatMessageType

  /**
   * User's initial for the avatar (only used for user messages)
   */
  userInitial?: string

  /**
   * Whether to show the sender name label above the message
   * Default: true
   */
  showName?: boolean

  /**
   * Custom name to display (overrides default "Harvey" or "You")
   */
  senderName?: string
}

export function ChatMessage({
  message,
  userInitial = 'U',
  showName = true,
  senderName,
}: ChatMessageProps) {
  const { role, content, status } = message
  const isAssistant = role === 'assistant'

  // Determine the display name
  const displayName = senderName || (isAssistant ? 'Harvey' : 'You')

  // ===== STREAMING STATE =====
  // When streaming, show content progressively (word-by-word). Only show dots when no content yet.
  const isStreaming = status === 'streaming' || status === 'sending'
  const showContent = content && content.length > 0

  // ===== HARVEY (ASSISTANT) MESSAGE =====
  if (isAssistant) {
    return (
      <div className="flex items-end gap-4 p-2">
        {/* Avatar on the left */}
        <ChatAvatar role="assistant" />

        {/* Message content */}
        <div className="flex flex-1 flex-col gap-1.5 items-start">
          {/* Sender name label */}
          {showName && (
            <p className="text-[#8B5CF6] text-[13px] font-bold leading-normal ml-1">
              {displayName}
            </p>
          )}

          {/* Message bubble - show streamed content progressively, or loading dots when no content yet */}
          <div className="text-base font-medium leading-relaxed flex max-w-[85%] rounded-2xl rounded-bl-none px-6 py-4 bg-white text-[#110d1c] shadow-md">
            {showContent ? (
              content
            ) : isStreaming ? (
              <span className="flex gap-1">
                <span className="animate-bounce">.</span>
                <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  // ===== USER MESSAGE =====
  return (
    <div className="flex items-end gap-4 p-2 justify-end">
      {/* Message content */}
      <div className="flex flex-1 flex-col gap-1.5 items-end">
        {/* Sender name label */}
        {showName && (
          <p className="text-[#8B5CF6] text-[13px] font-bold leading-normal mr-1">
            {displayName}
          </p>
        )}

        {/* Message bubble - purple background, rounded except bottom-right */}
        <div className="text-base font-medium leading-relaxed flex max-w-[85%] rounded-2xl rounded-br-none px-6 py-4 bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/30">
          {content}
        </div>
      </div>

      {/* Avatar on the right */}
      <ChatAvatar role="user" userInitial={userInitial} />
    </div>
  )
}

/**
 * ChatMessageList Component
 *
 * Renders a list of chat messages.
 * Useful for displaying the full conversation.
 */
interface ChatMessageListProps {
  /**
   * Array of messages to display
   */
  messages: ChatMessageType[]

  /**
   * User's initial for avatars
   */
  userInitial?: string
}

export function ChatMessageList({
  messages,
  userInitial = 'U',
}: ChatMessageListProps) {
  return (
    <div className="flex flex-col gap-8 w-full">
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          userInitial={userInitial}
        />
      ))}
    </div>
  )
}
