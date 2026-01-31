/**
 * Auth Error Display Component
 * 
 * Consistent error display across all auth flows
 */

'use client'

interface AuthErrorProps {
  message: string
  onDismiss?: () => void
}

export function AuthError({ message, onDismiss }: AuthErrorProps) {
  return (
    <div className="relative mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-start gap-3">
        <span className="text-red-500 text-xl">⚠️</span>
        <div className="flex-1">
          <p className="text-red-800 text-sm font-medium">Authentication Error</p>
          <p className="text-red-600 text-sm mt-1">{message}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-red-400 hover:text-red-600 transition-colors"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}