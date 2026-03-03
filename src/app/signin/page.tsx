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
 * 1. 'buttons': Show AuthButtons (Google + Email options + Login link)
 * 2. 'signup': Show EmailSignupForm (collect email for new users)
 * 3. 'login': Show EmailLoginForm (magic link login for existing users)
 */

'use client'

import { useState } from 'react'
import { AuthButtons } from '@/components/auth/AuthButtons'
import { EmailSignupForm } from '@/components/auth/EmailSignupForm'
import { EmailLoginForm } from '@/components/auth/EmailLoginForm'

/**
 * View states for the signin page
 * - 'buttons': Initial state with auth options
 * - 'signup': Email signup form for new users
 * - 'login': Email login form for existing users (magic link)
 */
type AuthView = 'buttons' | 'signup' | 'login'

export default function SigninPage() {
  // ===== STATE MANAGEMENT =====

  /**
   * currentView: Controls which component to display
   * - 'buttons': Show AuthButtons (initial state)
   * - 'signup': Show EmailSignupForm (for new users)
   * - 'login': Show EmailLoginForm (for existing users)
   */
  const [currentView, setCurrentView] = useState<AuthView>('buttons')

  /**
   * error: Stores error messages from auth attempts
   * Displayed above the active component
   */
  const [error, setError] = useState<string | null>(null)

  // ===== EVENT HANDLERS =====

  /**
   * Switch to email signup form
   * Called when user clicks "Continue with Email" button
   */
  const handleShowSignupForm = () => {
    setCurrentView('signup')
    setError(null) // Clear any previous errors
  }

  /**
   * Switch to email login form
   * Called when user clicks "Log in" link
   */
  const handleShowLoginForm = () => {
    setCurrentView('login')
    setError(null) // Clear any previous errors
  }

  /**
   * Return to initial auth buttons
   * Called when user clicks back button in any form
   */
  const handleBackToButtons = () => {
    setCurrentView('buttons')
    setError(null)
  }

  /**
   * Display error message
   * Called by child components when auth fails
   */
  const handleError = (errorMessage: string) => {
    setError(errorMessage)
  }

  /**
   * Get the header text based on current view
   * Different headers for signup vs login vs initial
   */
  const getHeaderText = () => {
    switch (currentView) {
      case 'signup':
        return {
          title: 'Create Your Account',
          subtitle: 'Enter your details to get started with Harvey',
        }
      case 'login':
        return {
          title: 'Welcome Back',
          subtitle: 'Enter your email to receive a login link',
        }
      default:
        return {
          title: 'Skyrocket Your Productivity',
          subtitle:
            'Meet Harvey, your AI-powered project coach designed to transform how you work.',
        }
    }
  }

  const headerText = getHeaderText()

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
            {/* Harvey Logo Icon — 4× original: container size-48 (192px), icon text-9xl; change here to resize */}
            <div className="size-48 bg-[#425ff0] rounded-xl flex items-center justify-center text-white mb-6 shadow-lg shadow-[#425ff0]/20">
              <span className="material-symbols-outlined text-9xl">auto_awesome</span>
            </div>
            {/* Brand Name */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl font-bold tracking-tight text-slate-900">Harvey</span>
            </div>
          </div>

          {/* Header Text - Changes based on current view */}
          <div className="text-center mb-10">
            <h1 className="text-[#0d101b] tracking-tight text-3xl font-bold leading-tight pb-3">
              {headerText.title}
            </h1>
            <p className="text-slate-600 text-base font-normal leading-relaxed px-4">
              {headerText.subtitle}
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
            CONDITIONAL RENDER: Show AuthButtons, EmailSignupForm, or EmailLoginForm
            This is the main switching logic - same page, different content
          */}
          {currentView === 'buttons' && (
            // Initial state: Show auth options (Google, Email signup, Login link)
            <AuthButtons
              onEmailClick={handleShowSignupForm}
              onLoginClick={handleShowLoginForm}
              onError={handleError}
            />
          )}

          {currentView === 'signup' && (
            // Signup form: Collect email + name for new users
            <EmailSignupForm
              onBack={handleBackToButtons}
              onError={handleError}
            />
          )}

          {currentView === 'login' && (
            // Login form: Magic link login for existing users
            <EmailLoginForm
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