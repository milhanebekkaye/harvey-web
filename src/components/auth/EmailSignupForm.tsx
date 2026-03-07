/**
 * EmailSignupForm Component
 *
 * Collects user's email and sends a verification link.
 * Name is collected later on the /onboarding/welcome screen.
 *
 * Flow:
 * 1. User enters email
 * 2. Validates input
 * 3. Creates Supabase account with email confirmation (verification link sent)
 * 4. Shows "Check your email" UI (same UX as login)
 * 5. User clicks link → /auth/callback → DB user created → redirect to /onboarding/welcome or /onboarding
 */

'use client'

import { ArrowRight, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { signUpWithEmail } from '@/lib/auth/auth-service'

interface EmailSignupFormProps {
  /**
   * Callback when user clicks back button
   * Returns to initial auth buttons
   */
  onBack: () => void

  /**
   * Callback for error handling
   * Passes errors up to parent for display
   */
  onError: (error: string) => void
}

export function EmailSignupForm({ onBack, onError }: EmailSignupFormProps) {
  // Form state
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  // Success state - same UX as login: show "Check your email" after sending verification link
  const [emailSent, setEmailSent] = useState(false)

  /**
   * Handle form submission
   * Sends verification email via Supabase. User must click the link before going to onboarding.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault() // Prevent default form submission
    
    // ===== VALIDATION =====
    
    if (!email || !email.includes('@')) {
      onError('Please enter a valid email address')
      return
    }

    setLoading(true)

    try {
      const result = await signUpWithEmail(email, `${window.location.origin}/auth/callback`)

      if (result.success) {
        // Verification email sent; show same UI as login
        setEmailSent(true)
      } else {
        onError(result.error?.message || 'Failed to create account')
        setLoading(false)
      }
    } catch (err: any) {
      onError(err.message || 'An unexpected error occurred')
      setLoading(false)
    }
  }

  // ===== SUCCESS STATE =====
  // Same verification-email UI/UX as login: "Check your email", link expires, try again, back
  if (emailSent) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <div className="size-16 bg-green-100 rounded-full flex items-center justify-center">
            <MailCheck className="w-10 h-10 text-green-600" />
          </div>
        </div>

        <div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            Check your email
          </h3>
          <p className="text-slate-600">
            We sent a verification link to{' '}
            <span className="font-semibold text-slate-900">{email}</span>
          </p>
          <p className="text-slate-500 text-sm mt-2">
            Click the link in the email to verify your address and get started. The link expires in 1 hour.
          </p>
        </div>

        <div className="space-y-3 pt-4">
          <button
            type="button"
            onClick={() => {
              setEmailSent(false)
              setLoading(false)
            }}
            className="text-[#425ff0] font-semibold hover:underline text-sm"
          >
            Didn't receive the email? Try again
          </button>

          <div className="flex items-center gap-4">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">or</span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          <button
            type="button"
            onClick={onBack}
            className="w-full h-12 px-5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors duration-200 text-slate-700 font-semibold text-sm"
          >
            ← Back to Sign In Options
          </button>
        </div>
      </div>
    )
  }

  // ===== SIGNUP FORM =====
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Email Input Field */}
      <div>
        <label 
          htmlFor="email" 
          className="block text-sm font-medium text-slate-700 mb-2"
        >
          Email Address
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          disabled={loading}
          className="w-full h-12 px-4 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#425ff0] focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Submit Button - Sends verification email */}
      <button
        type="submit"
        disabled={loading || !email}
        className="w-full h-12 px-5 bg-[#425ff0] hover:bg-[#425ff0]/90 text-white rounded-lg transition-all duration-200 font-bold text-base shadow-lg shadow-[#425ff0]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
      >
        {loading ? (
          <>
            <span className="animate-spin">⏳</span>
            Sending verification link...
          </>
        ) : (
          <>
            <ArrowRight className="w-5 h-5" />
            Create Account
          </>
        )}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-4 my-2">
        <div className="h-px bg-slate-200 flex-1" />
        <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">or</span>
        <div className="h-px bg-slate-200 flex-1" />
      </div>

      {/* Back Button - Returns to auth buttons */}
      <button
        type="button"
        onClick={onBack}
        disabled={loading}
        className="w-full h-12 px-5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors duration-200 text-slate-700 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ← Back to Sign In Options
      </button>
    </form>
  )
}