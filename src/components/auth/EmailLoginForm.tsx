/**
 * EmailLoginForm Component
 *
 * Allows existing users to log in via Magic Link.
 *
 * Why Magic Link?
 * - Users sign up with a random password they don't know
 * - Magic Link is passwordless: user enters email, clicks link in email, done!
 * - More secure than passwords (no password to steal or forget)
 *
 * Flow:
 * 1. User enters their email address
 * 2. We send a magic link to their email using Supabase
 * 3. User clicks the link in their email
 * 4. Link redirects to /auth/callback with a token
 * 5. User is authenticated and redirected to dashboard/onboarding
 */

'use client'

import { useState } from 'react'
import { signInWithMagicLink } from '@/lib/auth/auth-service'

interface EmailLoginFormProps {
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

export function EmailLoginForm({ onBack, onError }: EmailLoginFormProps) {
  // Form state
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  // Success state - shows confirmation message after sending magic link
  const [emailSent, setEmailSent] = useState(false)

  /**
   * Handle form submission
   *
   * Sends a magic link to the user's email.
   * User must check their email and click the link to log in.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault() // Prevent default form submission

    // ===== VALIDATION =====

    // Validate email format
    if (!email || !email.includes('@')) {
      onError('Please enter a valid email address')
      return
    }

    setLoading(true)

    try {
      // Check if this email has an account before sending magic link
      const checkRes = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const checkData = await checkRes.json().catch(() => ({ exists: false }))

      if (!checkData.exists) {
        onError('No account found with this email. Sign up first.')
        setLoading(false)
        return
      }

      // Send magic link to user's email
      const result = await signInWithMagicLink({
        email,
        redirectTo: `${window.location.origin}/auth/callback`,
      })

      if (result.success) {
        // Magic link sent successfully!
        // Show success message and wait for user to click link
        setEmailSent(true)
      } else {
        // Show error (e.g., email not found, rate limited, etc.)
        onError(result.error?.message || 'Failed to send login link')
      }
    } catch (err: any) {
      onError(err.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  // ===== SUCCESS STATE =====
  // After magic link is sent, show confirmation message
  if (emailSent) {
    return (
      <div className="space-y-6 text-center">
        {/* Success Icon */}
        <div className="flex justify-center">
          <div className="size-16 bg-green-100 rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-green-600">
              mark_email_read
            </span>
          </div>
        </div>

        {/* Success Message */}
        <div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            Check your email
          </h3>
          <p className="text-slate-600">
            We sent a login link to{' '}
            <span className="font-semibold text-slate-900">{email}</span>
          </p>
          <p className="text-slate-500 text-sm mt-2">
            Click the link in the email to log in. The link expires in 1 hour.
          </p>
        </div>

        {/* Resend / Back Options */}
        <div className="space-y-3 pt-4">
          {/* Resend Button */}
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

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              or
            </span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          {/* Back Button */}
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

  // ===== LOGIN FORM =====
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Email Input Field */}
      <div>
        <label
          htmlFor="login-email"
          className="block text-sm font-medium text-slate-700 mb-2"
        >
          Email Address
        </label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          disabled={loading}
          autoFocus // Auto-focus for better UX
          className="w-full h-12 px-4 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#425ff0] focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Info Text - Explains the magic link flow */}
      <p className="text-sm text-slate-500">
        We'll send you a magic link to log in. No password needed!
      </p>

      {/* Submit Button - Sends magic link */}
      <button
        type="submit"
        disabled={loading || !email}
        className="w-full h-12 px-5 bg-[#425ff0] hover:bg-[#425ff0]/90 text-white rounded-lg transition-all duration-200 font-bold text-base shadow-lg shadow-[#425ff0]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
      >
        {loading ? (
          <>
            <span className="animate-spin">⏳</span>
            Sending Link...
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-xl">send</span>
            Send Login Link
          </>
        )}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-4 my-2">
        <div className="h-px bg-slate-200 flex-1" />
        <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
          or
        </span>
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
