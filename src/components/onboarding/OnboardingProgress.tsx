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

interface OnboardingProgressProps {
  /**
   * Progress percentage (0-100)
   */
  percentage: number

  /**
   * Current step label (e.g., "Project Details", "Availability")
   */
  currentStep: string

  /**
   * Whether onboarding is complete
   */
  isComplete?: boolean

  /**
   * Optional status text to show below progress bar
   * Defaults based on isComplete state
   */
  statusText?: string
}

export function OnboardingProgress({
  percentage,
  currentStep,
  isComplete = false,
  statusText,
}: OnboardingProgressProps) {
  // Clamp percentage between 0 and 100
  const clampedPercentage = Math.min(100, Math.max(0, percentage))

  // Determine the icon based on completion state
  const icon = isComplete ? 'check_circle' : 'pending'

  // Default status text based on state
  const defaultStatusText = isComplete
    ? 'Setup Finished • Harvey is ready'
    : `Step in progress • ${currentStep}`

  return (
    <div className="w-full flex justify-center pt-8 px-4">
      <div className="w-full max-w-[700px] flex flex-col gap-3">
        {/* Progress Title and Percentage */}
        <div className="flex gap-6 justify-between items-end">
          {/* Left: Icon + Step Name */}
          <div className="flex items-center gap-2">
            <span
              className={`material-symbols-outlined text-[#8B5CF6] text-xl ${
                !isComplete ? 'animate-pulse' : ''
              }`}
            >
              {icon}
            </span>
            <p className="text-[#110d1c] text-base font-semibold leading-normal">
              {isComplete ? 'Onboarding Complete' : currentStep}
            </p>
          </div>

          {/* Right: Percentage */}
          <p className="text-[#8B5CF6] text-sm font-bold leading-normal">
            {clampedPercentage}%
          </p>
        </div>

        {/* Progress Bar */}
        <div className="rounded-full bg-[#8B5CF6]/20 h-3 overflow-hidden shadow-sm">
          <div
            className="h-full rounded-full bg-[#8B5CF6] transition-all duration-500 ease-out"
            style={{ width: `${clampedPercentage}%` }}
          />
        </div>

        {/* Status Text */}
        <p className="text-[#8B5CF6] text-xs font-medium uppercase tracking-wider">
          {statusText || defaultStatusText}
        </p>
      </div>
    </div>
  )
}
