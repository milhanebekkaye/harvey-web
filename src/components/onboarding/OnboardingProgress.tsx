/**
 * OnboardingProgress Component
 *
 * Displays the progress header during onboarding.
 * Shows:
 * - Current step name
 * - Progress percentage
 * - Animated progress bar
 * - Status text
 *
 * Future AI Integration:
 * - Progress will be calculated based on conversation state
 * - Steps will update as AI gathers information
 */

import { CheckCircle, Clock } from 'lucide-react'

interface OnboardingProgressProps {
  /**
   * Progress percentage (0-100)
   */
  percentage: number

  /**
   * Whether onboarding is complete
   */
  isComplete?: boolean
}

export function OnboardingProgress({
  percentage,
  isComplete = false,
}: OnboardingProgressProps) {
  // Clamp percentage between 0 and 100
  const clampedPercentage = Math.min(100, Math.max(0, percentage))

  // Label text
  const labelText = isComplete ? 'Onboarding Complete' : 'Setting up your project'

  return (
    <div className="w-full flex justify-center pt-8 px-4">
      <div className="w-full max-w-[700px] flex flex-col gap-3">
        {/* Progress Title */}
        <div className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle className={`w-5 h-5 text-[#8B5CF6]`} />
          ) : (
            <Clock className={`w-5 h-5 text-[#8B5CF6] animate-pulse`} />
          )}
          <p className="text-[#110d1c] text-base font-semibold leading-normal">
            {labelText}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="rounded-full bg-[#8B5CF6]/20 h-3 overflow-hidden shadow-sm">
          <div
            className="h-full rounded-full bg-[#8B5CF6] transition-all duration-500 ease-out"
            style={{ width: `${clampedPercentage}%` }}
          />
        </div>
      </div>
    </div>
  )
}
