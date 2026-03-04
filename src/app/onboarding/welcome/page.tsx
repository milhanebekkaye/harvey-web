/**
 * Onboarding Welcome Page
 *
 * Shown immediately after authentication for new users who don't have a name set.
 * Uses AuthPageLayout + WelcomeNameCard (penguin avatar, "What should Harvey call you?").
 * On submit: PATCH /api/user/name then redirect to /onboarding/questions.
 */

'use client'

import { AuthPageLayout } from '@/components/auth/AuthPageLayout'
import { WelcomeNameCard } from '@/components/onboarding/WelcomeNameCard'

export default function OnboardingWelcomePage() {
  return (
    <AuthPageLayout>
      <WelcomeNameCard />
    </AuthPageLayout>
  )
}
