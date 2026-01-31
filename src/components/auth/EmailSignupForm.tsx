/**
 * EmailSignupForm Component
 * 
 * Collects user's email and name to create account.
 * 
 * Flow:
 * 1. User enters email + name
 * 2. Validates input
 * 3. Creates Supabase account (no email confirmation)
 * 4. User is immediately signed in
 * 5. Redirects to onboarding
 * 
 * No email confirmation needed for MVP.
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  
  // Form state
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  /**
   * Handle form submission
   * 
   * Creates account and immediately signs user in.
   * No email verification needed.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault() // Prevent default form submission
    
    // ===== VALIDATION =====
    
    // Validate email format
    if (!email || !email.includes('@')) {
      onError('Please enter a valid email address')
      return
    }
    
    // Validate name (at least 2 characters)
    if (!name || name.trim().length < 2) {
      onError('Please enter your full name')
      return
    }

    setLoading(true)

    try {
      // Create account with Supabase (immediate signup, no confirmation)
      const result = await signUpWithEmail(email, name)

      if (result.success) {
        // Account created and user is signed in!
        // Redirect to onboarding immediately
        router.push('/onboarding')
      } else {
        // Show error (e.g., email already exists)
        onError(result.error?.message || 'Failed to create account')
        setLoading(false)
      }
    } catch (err: any) {
      onError(err.message || 'An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      
      {/* Name Input Field */}
      <div>
        <label 
          htmlFor="name" 
          className="block text-sm font-medium text-slate-700 mb-2"
        >
          Full Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="John Doe"
          required
          disabled={loading}
          autoFocus // Auto-focus for better UX
          className="w-full h-12 px-4 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#425ff0] focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

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

      {/* Submit Button - Creates account immediately */}
      <button
        type="submit"
        disabled={loading || !email || !name}
        className="w-full h-12 px-5 bg-[#425ff0] hover:bg-[#425ff0]/90 text-white rounded-lg transition-all duration-200 font-bold text-base shadow-lg shadow-[#425ff0]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
      >
        {loading ? (
          <>
            <span className="animate-spin">⏳</span>
            Creating Account...
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-xl">arrow_forward</span>
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