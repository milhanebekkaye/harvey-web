/**
 * Signin Page - Main Entry Point
 * 
 * This page is THIN - it only handles:
 * - State management (which component to show)
 * - Error display
 * - Layout/styling
 * 
 * All business logic lives in components and services.
 * 
 * States:
 * 1. Initial: Show AuthButtons (Google + Email options)
 * 2. Email Form: Show EmailSignupForm (collect email + name)
 */

'use client'

import { useState } from 'react'
import { AuthButtons } from '@/components/auth/AuthButtons'
import { EmailSignupForm } from '@/components/auth/EmailSignupForm'

export default function SigninPage() {
  // ===== STATE MANAGEMENT =====
  
  /**
   * showEmailForm: Controls which component to display
   * - false: Show AuthButtons (initial state)
   * - true: Show EmailSignupForm
   */
  const [showEmailForm, setShowEmailForm] = useState(false)
  
  /**
   * error: Stores error messages from auth attempts
   * Displayed above the active component
   */
  const [error, setError] = useState<string | null>(null)

  // ===== EVENT HANDLERS =====

  /**
   * Switch to email form view
   * Called when user clicks "Continue with Email" button
   */
  const handleShowEmailForm = () => {
    setShowEmailForm(true)
    setError(null) // Clear any previous errors
  }

  /**
   * Return to initial auth buttons
   * Called when user clicks back button in email form
   */
  const handleBackToButtons = () => {
    setShowEmailForm(false)
    setError(null)
  }

  /**
   * Display error message
   * Called by child components when auth fails
   */
  const handleError = (errorMessage: string) => {
    setError(errorMessage)
  }

  // ===== RENDER =====

  return (
    <div className="font-display bg-[#FAF9F6] min-h-screen flex items-center justify-center relative overflow-hidden">
      
      {/* Aurora Background Effect - Animated gradient blob */}
      <div className="aurora-bg" />

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-[520px] px-6 py-12">
        
        {/* Glass-morphism Card */}
        <div className="glass-card rounded-2xl p-8 md:p-12 transition-all duration-300">
          
          {/* Logo Section - Always visible */}
          <div className="flex flex-col items-center mb-8">
            {/* Harvey Logo Icon */}
            <div className="size-12 bg-[#425ff0] rounded-xl flex items-center justify-center text-white mb-6 shadow-lg shadow-[#425ff0]/20">
              <span className="material-symbols-outlined text-3xl">auto_awesome</span>
            </div>
            {/* Brand Name */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl font-bold tracking-tight text-slate-900">Harvey</span>
            </div>
          </div>

          {/* Header Text - Changes based on state */}
          <div className="text-center mb-10">
            <h1 className="text-[#0d101b] tracking-tight text-3xl font-bold leading-tight pb-3">
              {showEmailForm ? 'Create Your Account' : 'Skyrocket Your Productivity'}
            </h1>
            <p className="text-slate-600 text-base font-normal leading-relaxed px-4">
              {showEmailForm 
                ? "Enter your details to get started with Harvey"
                : "Meet Harvey, your AI-powered project coach designed to transform how you work."
              }
            </p>
          </div>

          {/* Error Display - Shows validation or API errors */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <span className="text-red-500 text-xl">⚠️</span>
                <div className="flex-1">
                  <p className="text-red-800 text-sm font-medium">Authentication Error</p>
                  <p className="text-red-600 text-sm mt-1">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-red-400 hover:text-red-600 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* 
            CONDITIONAL RENDER: Show either AuthButtons OR EmailSignupForm
            This is the main switching logic - same page, different content
          */}
          {!showEmailForm ? (
            // Initial state: Show auth options
            <AuthButtons 
              onEmailClick={handleShowEmailForm}
              onError={handleError}
            />
          ) : (
            // Email form state: Show signup form
            <EmailSignupForm 
              onBack={handleBackToButtons}
              onError={handleError}
            />
          )}

          {/* Footer Terms Text - Always visible */}
          <p className="text-slate-500 text-[13px] font-normal leading-normal mt-8 text-center max-w-[320px] mx-auto">
            By continuing, you agree to Harvey's{' '}
            <a className="text-[#425ff0] hover:underline font-medium" href="#">
              Terms of Service
            </a>{' '}
            and{' '}
            <a className="text-[#425ff0] hover:underline font-medium" href="#">
              Privacy Policy
            </a>.
          </p>
        </div>

        {/* Secondary Bottom Links - Always visible */}
        <div className="mt-8 flex justify-center gap-6">
          <a className="text-sm font-medium text-slate-500 hover:text-[#425ff0] transition-colors" href="#">
            Help Center
          </a>
          <a className="text-sm font-medium text-slate-500 hover:text-[#425ff0] transition-colors" href="#">
            Contact Support
          </a>
          <a className="text-sm font-medium text-slate-500 hover:text-[#425ff0] transition-colors" href="#">
            Join Beta
          </a>
        </div>
      </div>

      {/* Decorative Background Gradient Blobs - Always visible */}
      <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-20 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-[#425ff0]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>
    </div>
  )
}