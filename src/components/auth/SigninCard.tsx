/**
 * SigninCard
 *
 * Card content for the signin page only: small Harvey logo (sparkle icon),
 * brand name, header (title/subtitle), error display, and slot for auth forms.
 * Logo size is intentionally small here; the onboarding welcome card uses
 * the penguin and is a separate component (WelcomeNameCard).
 *
 * Used inside AuthPageLayout on the signin page.
 */

import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

export interface SigninCardHeader {
  title: string
  subtitle: string
}

interface SigninCardProps {
  headerText: SigninCardHeader
  error: string | null
  onClearError: () => void
  children: ReactNode
}

export function SigninCard({
  headerText,
  error,
  onClearError,
  children,
}: SigninCardProps) {
  return (
    <>
      {/* Logo Section — small Harvey logo (signin only) */}
      <div className="flex flex-col items-center mb-8">
        <div className="size-12 bg-[#425ff0] rounded-xl flex items-center justify-center text-white mb-6 shadow-lg shadow-[#425ff0]/20">
          <Sparkles className="w-8 h-8" />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl font-bold tracking-tight text-slate-900">Harvey</span>
        </div>
      </div>

      {/* Header Text */}
      <div className="text-center mb-10">
        <h1 className="text-[#0d101b] tracking-tight text-3xl font-bold leading-tight pb-3">
          {headerText.title}
        </h1>
        <p className="text-slate-600 text-base font-normal leading-relaxed px-4">
          {headerText.subtitle}
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-red-500 text-xl">⚠️</span>
            <div className="flex-1">
              <p className="text-red-800 text-sm font-medium">Authentication Error</p>
              <p className="text-red-600 text-sm mt-1">{error}</p>
            </div>
            <button
              onClick={onClearError}
              className="text-red-400 hover:text-red-600 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Auth forms (AuthButtons, EmailSignupForm, or EmailLoginForm) */}
      {children}

      {/* Footer Terms */}
      <p className="text-slate-500 text-[13px] font-normal leading-normal mt-8 text-center max-w-[320px] mx-auto">
        By continuing, you agree to Harvey&apos;s{' '}
        <a className="text-[#425ff0] hover:underline font-medium" href="#">
          Terms of Service
        </a>{' '}
        and{' '}
        <a className="text-[#425ff0] hover:underline font-medium" href="#">
          Privacy Policy
        </a>.
      </p>
    </>
  )
}
