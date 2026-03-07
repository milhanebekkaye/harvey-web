/**
 * ChatAvatar Component
 *
 * Displays the avatar for either Harvey (AI) or the user.
 * Used in chat messages to identify who is speaking.
 *
 * Variants:
 * - 'assistant': Purple background with robot icon (Harvey)
 * - 'user': Gradient background with user's initial
 */

import { Bot } from 'lucide-react'
import type { MessageRole } from '@/types/chat.types'

interface ChatAvatarProps {
  /**
   * Who this avatar represents: 'assistant' (Harvey) or 'user'
   */
  role: MessageRole

  /**
   * User's initial letter (only used when role is 'user')
   * Defaults to 'U' if not provided
   */
  userInitial?: string

  /**
   * Optional size variant
   * - 'default': 48px (w-12 h-12)
   * - 'small': 36px (w-9 h-9)
   */
  size?: 'default' | 'small'
}

export function ChatAvatar({
  role,
  userInitial = 'U',
  size = 'default',
}: ChatAvatarProps) {
  // Size classes based on variant
  const sizeClasses = size === 'small' ? 'w-9 h-9' : 'w-12 h-12'
  const iconSizeClasses = size === 'small' ? 'w-6 h-6' : 'w-8 h-8'
  const textSize = size === 'small' ? 'text-sm' : 'text-lg'

  // ===== HARVEY (AI) AVATAR =====
  if (role === 'assistant') {
    return (
      <div
        className={`bg-[#8B5CF6] aspect-square rounded-xl ${sizeClasses} shrink-0 flex items-center justify-center shadow-lg shadow-[#8B5CF6]/20`}
      >
        {/* Robot icon for Harvey */}
        <Bot className={`${iconSizeClasses} text-white`} />
      </div>
    )
  }

  // ===== USER AVATAR =====
  return (
    <div
      className={`bg-gradient-to-br from-[#8B5CF6] to-[#7C3AED] aspect-square rounded-xl ${sizeClasses} shrink-0 flex items-center justify-center text-white font-bold ${textSize} shadow-lg`}
    >
      {/* Display user's initial letter */}
      {userInitial.charAt(0).toUpperCase()}
    </div>
  )
}
