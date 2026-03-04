/**
 * Signin Page - Main Entry Point
 *
 * This page is THIN - it only handles:
 * - State management (which component to show)
 * - Error display
 * - Layout via AuthPageLayout + SigninCard
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
import { AuthPageLayout } from '@/components/auth/AuthPageLayout'
import { SigninCard } from '@/components/auth/SigninCard'
import { AuthButtons } from '@/components/auth/AuthButtons'
import { EmailSignupForm } from '@/components/auth/EmailSignupForm'
import { EmailLoginForm } from '@/components/auth/EmailLoginForm'

type AuthView = 'buttons' | 'signup' | 'login'

export default function SigninPage() {
  const [currentView, setCurrentView] = useState<AuthView>('buttons')
  const [error, setError] = useState<string | null>(null)

  const handleShowSignupForm = () => {
    setCurrentView('signup')
    setError(null)
  }

  const handleShowLoginForm = () => {
    setCurrentView('login')
    setError(null)
  }

  const handleBackToButtons = () => {
    setCurrentView('buttons')
    setError(null)
  }

  const handleError = (errorMessage: string) => {
    setError(errorMessage)
  }

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

  const bottomSection = (
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
  )

  return (
    <AuthPageLayout bottomSection={bottomSection}>
      <SigninCard
        headerText={headerText}
        error={error}
        onClearError={() => setError(null)}
      >
        {currentView === 'buttons' && (
          <AuthButtons
            onEmailClick={handleShowSignupForm}
            onLoginClick={handleShowLoginForm}
            onError={handleError}
          />
        )}

        {currentView === 'signup' && (
          <EmailSignupForm onBack={handleBackToButtons} onError={handleError} />
        )}

        {currentView === 'login' && (
          <EmailLoginForm onBack={handleBackToButtons} onError={handleError} />
        )}
      </SigninCard>
    </AuthPageLayout>
  )
}
