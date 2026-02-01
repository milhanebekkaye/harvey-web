/**
 * AuthButtons Component
 * 
 * Displays initial authentication options:
 * - Google OAuth button
 * - Email signup button
 * 
 * This is the INITIAL STATE of the signin page.
 * When email button is clicked, parent component switches to EmailSignupForm.
 */

'use client'

import { useState } from 'react'
import { signInWithGoogle } from '@/lib/auth/auth-service'

interface AuthButtonsProps {
  /**
   * Callback when email signup button is clicked
   * Parent component uses this to switch to email signup form
   */
  onEmailClick: () => void

  /**
   * Callback when login link is clicked
   * Parent component uses this to switch to email login form
   */
  onLoginClick: () => void

  /**
   * Callback for error handling
   * Passes errors up to parent for display
   */
  onError: (error: string) => void
}

export function AuthButtons({ onEmailClick, onLoginClick, onError }: AuthButtonsProps) {
  // Loading states for each button (prevents multiple simultaneous requests)
  const [loadingGoogle, setLoadingGoogle] = useState(false)

  /**
   * Handle Google OAuth authentication
   * 
   * Redirects user to Google consent screen.
   * After approval, Google redirects to /auth/callback.
   */
  const handleGoogleAuth = async () => {
    try {
      setLoadingGoogle(true)
      
      const result = await signInWithGoogle({ 
        redirectTo: `${window.location.origin}/auth/callback` 
      })
      
      if (!result.success) {
        onError(result.error?.message || 'Google sign-in failed')
        setLoadingGoogle(false)
      }
      // If successful, user is redirected, so no need to reset loading state
    } catch (err: any) {
      onError(err.message || 'An unexpected error occurred')
      setLoadingGoogle(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      
      {/* Google Sign In Button */}
      <button 
        onClick={handleGoogleAuth}
        disabled={loadingGoogle}
        className="flex items-center justify-center gap-3 w-full h-12 px-5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors duration-200 text-slate-700 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loadingGoogle ? (
          <span className="animate-spin">⏳</span>
        ) : (
          // Google Logo SVG
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        )}
        Continue with Google
      </button>

      {/* Divider with "or" text */}
      <div className="flex items-center gap-4 my-2">
        <div className="h-px bg-slate-200 flex-1" />
        <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">or</span>
        <div className="h-px bg-slate-200 flex-1" />
      </div>

      {/* Email Button - Triggers signup form display in parent component */}
      <button
        onClick={onEmailClick}
        disabled={loadingGoogle}
        className="flex items-center justify-center gap-3 w-full h-12 px-5 bg-[#425ff0] hover:bg-[#425ff0]/90 text-white rounded-lg transition-all duration-200 font-bold text-base shadow-lg shadow-[#425ff0]/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined text-xl">mail</span>
        Continue with Email
      </button>

      {/* Login Link - For existing users who want to log back in */}
      <p className="text-center text-sm text-slate-600 mt-2">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onLoginClick}
          disabled={loadingGoogle}
          className="text-[#425ff0] font-semibold hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Log in
        </button>
      </p>
    </div>
  )
}