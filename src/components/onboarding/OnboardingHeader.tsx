/**
 * OnboardingHeader Component
 *
 * Displays the headline section in the onboarding chat.
 * Shows a badge and a styled headline text.
 *
 * Used to show success messages or section headers.
 */

interface OnboardingHeaderProps {
  /**
   * Small badge text above the headline
   * Default: "Success"
   */
  badgeText?: string

  /**
   * Main headline text (can include line breaks)
   */
  headline: string

  /**
   * Text to highlight in purple italic
   * This text will be styled differently
   */
  highlightText?: string
}

export function OnboardingHeader({
  badgeText = 'Success',
  headline,
  highlightText,
}: OnboardingHeaderProps) {
  // If there's highlight text, split the headline
  const renderHeadline = () => {
    if (!highlightText) {
      return headline
    }

    // Split by highlight text to render it differently
    const parts = headline.split(highlightText)

    return (
      <>
        {parts[0]}
        <span className="text-[#8B5CF6] italic">{highlightText}</span>
        {parts[1] || ''}
      </>
    )
  }

  return (
    <div className="flex flex-col items-center mb-4">
      {/* Badge */}
      <div className="bg-[#8B5CF6]/10 text-[#8B5CF6] px-4 py-1 rounded-full text-xs font-bold mb-3 uppercase tracking-widest">
        {badgeText}
      </div>

      {/* Headline */}
      <h2 className="text-[#110d1c] tracking-tight text-[32px] font-extrabold leading-tight text-center">
        {renderHeadline()}
      </h2>
    </div>
  )
}
