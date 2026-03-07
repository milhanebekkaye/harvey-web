/**
 * OnboardingCTA Component
 *
 * Call-to-action section at the bottom of onboarding.
 * Shows the "Build my schedule" button when conversation is complete.
 *
 * Features:
 * - Animated shimmer effect on hover
 * - Loading state while generating schedule
 * - Customizable button text and subtitle
 */

'use client'

import type { LucideIcon } from 'lucide-react'
import { Loader2, Rocket } from 'lucide-react'

interface OnboardingCTAProps {
  /**
   * Callback when user clicks the CTA button
   */
  onClick: () => void

  /**
   * Whether the button is in loading state
   */
  isLoading?: boolean

  /**
   * Whether the CTA is disabled
   */
  disabled?: boolean

  /**
   * Main button text
   * Default: "Build my schedule"
   */
  buttonText?: string

  /**
   * Small text above the button
   * Default: "Final Step"
   */
  labelText?: string

  /**
   * Subtitle text below the label
   * Default: "Harvey is ready to transform your goals into a step-by-step plan."
   */
  subtitleText?: string

  /**
   * Helper text below the button
   * Default: "Takes about 30 seconds to generate your roadmap"
   */
  helperText?: string

  /**
   * Icon to display in the button (Lucide component)
   * Default: Rocket
   */
  icon?: LucideIcon
}

export function OnboardingCTA({
  onClick,
  isLoading = false,
  disabled = false,
  buttonText = 'Build my schedule',
  labelText = 'Final Step',
  subtitleText = 'Harvey is ready to transform your goals into a step-by-step plan.',
  helperText = 'Takes about 30 seconds to generate your roadmap',
  icon: Icon = Rocket,
}: OnboardingCTAProps) {
  const isDisabled = disabled || isLoading

  return (
    <div className="w-full bg-white/40 backdrop-blur-md border-t border-[#8B5CF6]/10 py-10 px-4">
      <div className="max-w-[700px] mx-auto flex flex-col items-center gap-6">
        {/* CTA Text */}
        <div className="text-center">
          <p className="text-[#8B5CF6] text-sm font-medium mb-2 uppercase tracking-wide">
            {labelText}
          </p>
          <p className="text-[#110d1c] text-lg font-medium">{subtitleText}</p>
        </div>

        {/* CTA Button */}
        <div className="flex flex-col items-center gap-4 w-full">
          <button
            onClick={onClick}
            disabled={isDisabled}
            className="group relative flex w-full max-w-[420px] cursor-pointer items-center justify-center overflow-hidden rounded-xl h-16 px-8 bg-[#8B5CF6] text-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-[#8B5CF6]/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {/* Shimmer effect on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />

            <div className="flex items-center gap-3 relative z-10">
              {isLoading ? (
                // Loading state
                <>
                  <Loader2 className="w-7 h-7 animate-spin" />
                  <span className="text-xl font-bold tracking-tight">
                    Building...
                  </span>
                </>
              ) : (
                // Normal state
                <>
                  <Icon className="w-7 h-7 group-hover:rotate-12 transition-transform" />
                  <span className="text-xl font-bold tracking-tight">
                    {buttonText}
                  </span>
                </>
              )}
            </div>
          </button>

          {/* Helper text */}
          <p className="text-xs text-[#8B5CF6]/60 font-normal">{helperText}</p>
        </div>
      </div>
    </div>
  )
}
