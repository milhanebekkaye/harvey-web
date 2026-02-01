/**
 * ChatInput Component
 *
 * Text input field for user to type and send messages.
 * Designed for AI chat integration.
 *
 * Features:
 * - Auto-expanding textarea
 * - Submit on Enter (Shift+Enter for new line)
 * - Loading state while AI is responding
 * - Disabled state for read-only conversations
 *
 * Future AI Integration:
 * - onSend callback will trigger AI API call
 * - isLoading will show while waiting for AI response
 */

'use client'

import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from 'react'

interface ChatInputProps {
  /**
   * Callback when user sends a message
   * @param content - The message text
   */
  onSend: (content: string) => void

  /**
   * Whether the input is disabled (e.g., AI is responding)
   */
  disabled?: boolean

  /**
   * Whether to show loading state (AI is thinking)
   */
  isLoading?: boolean

  /**
   * Placeholder text for the input
   */
  placeholder?: string

  /**
   * Auto-focus the input on mount
   */
  autoFocus?: boolean
}

export function ChatInput({
  onSend,
  disabled = false,
  isLoading = false,
  placeholder = 'Type your message...',
  autoFocus = false,
}: ChatInputProps) {
  // Current input value
  const [value, setValue] = useState('')

  // Ref for auto-expanding textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /**
   * Auto-expand textarea height based on content
   * Runs whenever value changes
   */
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto'
      // Set height to scrollHeight (content height)
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [value])

  /**
   * Handle input change
   */
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
  }

  /**
   * Handle key press for submit on Enter
   * Shift+Enter creates a new line instead of submitting
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault() // Prevent new line
      handleSubmit()
    }
  }

  /**
   * Handle form submission
   * Validates input and calls onSend callback
   */
  const handleSubmit = () => {
    const trimmedValue = value.trim()

    // Don't submit empty messages
    if (!trimmedValue) return

    // Don't submit while loading or disabled
    if (disabled || isLoading) return

    // Call the onSend callback
    onSend(trimmedValue)

    // Clear the input
    setValue('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  // Combined disabled state
  const isDisabled = disabled || isLoading

  return (
    <div className="w-full bg-white/60 backdrop-blur-md border-t border-[#8B5CF6]/10 p-4">
      <div className="max-w-[700px] mx-auto">
        <div className="flex items-end gap-3">
          {/* Text input area */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isDisabled}
              autoFocus={autoFocus}
              rows={1}
              className="w-full resize-none rounded-2xl border border-[#8B5CF6]/20 bg-white px-5 py-4 text-base text-[#110d1c] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ minHeight: '56px', maxHeight: '200px' }}
            />
          </div>

          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isDisabled || !value.trim()}
            className="flex items-center justify-center h-14 w-14 rounded-xl bg-[#8B5CF6] text-white transition-all hover:bg-[#7C3AED] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#8B5CF6]/30"
          >
            {isLoading ? (
              // Loading spinner
              <span className="animate-spin">
                <span className="material-symbols-outlined text-2xl">
                  progress_activity
                </span>
              </span>
            ) : (
              // Send icon
              <span className="material-symbols-outlined text-2xl">send</span>
            )}
          </button>
        </div>

        {/* Helper text */}
        <p className="text-xs text-slate-400 mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
