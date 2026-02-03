/**
 * Chat Sidebar Component
 *
 * Displays the conversation history from onboarding in the dashboard.
 * Shows Harvey's messages and user responses in a chat-like interface.
 *
 * Features:
 * - Harvey header with avatar
 * - Scrollable message history
 * - Read-only input with lock message
 * - Loading and empty states
 */

'use client'

import type { ChatMessage } from '@/types/chat.types'

/**
 * Props for ChatSidebar component
 */
interface ChatSidebarProps {
  /**
   * Conversation messages to display
   */
  messages: ChatMessage[]

  /**
   * Project title to show in constraint pill (optional)
   */
  projectTitle?: string

  /**
   * Whether messages are loading
   */
  isLoading?: boolean

  /**
   * Callback when sign out button is clicked
   */
  onSignOut?: () => void
}

/**
 * ChatSidebar Component
 *
 * Renders the left sidebar of the dashboard with conversation history.
 *
 * @example
 * <ChatSidebar
 *   messages={messages}
 *   projectTitle="My Project"
 *   onSignOut={handleSignOut}
 * />
 */
export function ChatSidebar({
  messages,
  projectTitle,
  isLoading = false,
  onSignOut,
}: ChatSidebarProps) {
  /**
   * Filter out messages containing PROJECT_INTAKE_COMPLETE
   * This marker should not be visible in the dashboard chat
   */
  const displayMessages = messages.filter(
    (msg) => !msg.content.includes('PROJECT_INTAKE_COMPLETE')
  )

  /**
   * Format timestamp for display
   */
  const formatTime = (timestamp?: Date | string): string => {
    if (!timestamp) return ''
    try {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    } catch {
      return ''
    }
  }

  return (
    <aside className="w-[40%] flex flex-col glass-sidebar z-10 relative">
      {/* Harvey Header */}
      <div className="p-6 flex items-center gap-4">
        <div className="size-12 rounded-full bg-[#895af6] flex items-center justify-center text-white shadow-lg overflow-hidden">
          <span className="text-2xl">🦞</span>
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Harvey</h1>
          <p className="text-sm text-[#62499c] font-medium opacity-80">AI Project Coach</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="bg-primary/10 hover:bg-primary/20 text-[#895af6] p-2 rounded-lg transition-colors">
            <span className="material-symbols-outlined">settings</span>
          </button>
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="bg-red-100 hover:bg-red-200 text-red-600 p-2 rounded-lg transition-colors"
              title="Sign Out"
            >
              <span className="material-symbols-outlined">logout</span>
            </button>
          )}
        </div>
      </div>

      {/* Project Info Pill */}
      {projectTitle && (
        <div className="px-6 pb-4">
          <div className="inline-flex items-center gap-2 bg-[#895af6] text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-md">
            <span className="material-symbols-outlined text-sm">folder</span>
            {projectTitle}
          </div>
        </div>
      )}

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-slate-400">
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              <span className="text-sm">Loading conversation...</span>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && displayMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">chat</span>
            <p className="text-sm text-slate-400">No conversation history</p>
          </div>
        )}

        {/* Messages */}
        {!isLoading &&
          displayMessages.map((message, index) => (
            <div
              key={message.id || `msg-${index}`}
              className={`flex flex-col gap-2 max-w-[85%] ${
                message.role === 'user' ? 'self-end items-end' : ''
              }`}
            >
              {/* Message Bubble */}
              <div
                className={`p-4 rounded-2xl shadow-sm ${
                  message.role === 'user'
                    ? 'bg-[#895af6] text-white rounded-tr-none shadow-md'
                    : 'bg-white rounded-tl-none border border-white/50'
                }`}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>

              {/* Timestamp */}
              <span
                className={`text-[10px] text-slate-500 uppercase font-bold tracking-wider ${
                  message.role === 'user' ? 'mr-1' : 'ml-1'
                }`}
              >
                {message.role === 'user' ? 'You' : 'Harvey'}
                {message.timestamp && ` • ${formatTime(message.timestamp)}`}
              </span>
            </div>
          ))}
      </div>

      {/* Read-Only Input */}
      <div className="p-6 border-t border-black/5 bg-white/20">
        <div className="relative flex items-center">
          <input
            type="text"
            placeholder="Chat is read-only. Editing coming soon!"
            disabled
            className="w-full bg-white/50 border-none rounded-xl py-4 pl-4 pr-12 text-sm shadow-inner cursor-not-allowed opacity-60"
          />
          <div className="absolute right-2 bg-slate-300 text-white p-2 rounded-lg">
            <span className="material-symbols-outlined">lock</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
