/**
 * AuthPageLayout
 *
 * Shared layout for auth-style pages: aurora gradient background, glass card
 * container, and decorative gradient blobs. Used by both the signin page and
 * the onboarding welcome/name card so the visual style stays consistent.
 *
 * Place your card content (logo, form, etc.) as children inside the card.
 */

import type { ReactNode } from 'react'

interface AuthPageLayoutProps {
  /** Content inside the glass card */
  children: ReactNode
  /** Optional section below the card (e.g. signin page footer links) */
  bottomSection?: ReactNode
}

export function AuthPageLayout({ children, bottomSection }: AuthPageLayoutProps) {
  return (
    <div className="font-display bg-[#FAF9F6] min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="aurora-bg" />

      <div className="relative z-10 w-full max-w-[520px] px-6 py-12">
        <div className="glass-card rounded-2xl p-8 md:p-12 transition-all duration-300">
          {children}
        </div>
        {bottomSection}
      </div>

      <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-20 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-[#425ff0]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>
    </div>
  )
}
