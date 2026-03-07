'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'

// ============================================
// Types
// ============================================

interface CutoutRect {
  top: number
  left: number
  width: number
  height: number
}

type TooltipPosition = 'left' | 'right' | 'top'

interface TourStep {
  target: string
  title: string
  body: string
  tooltipPosition: TooltipPosition
  scrollBlock: ScrollLogicalPosition
}

interface GuidedTourProps {
  onComplete: () => void
  userId: string
}

// ============================================
// Step definitions (spotlight steps only)
// ============================================

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="active-task"]',
    title: 'Your first task is ready',
    body: "Harvey broke down your project into clear, executable tasks. This is your current task — with everything you need to get started: description, success criteria, and Harvey's coaching tip.",
    tooltipPosition: 'left',
    scrollBlock: 'start',
  },
  {
    target: '[data-tour="task-actions"]',
    title: 'Track your progress',
    body: "Complete tasks when you're done, or skip them if you can't get to it — Harvey will adapt. The more you use it, the better Harvey understands your rhythm and builds smarter schedules.",
    tooltipPosition: 'top',
    scrollBlock: 'center',
  },
  {
    target: '[data-tour="chat-sidebar"]',
    title: 'Harvey is always here',
    body: 'This is your direct line to Harvey. Ask him to reschedule tasks, change your availability, get a progress summary, or figure out what to work on next.',
    tooltipPosition: 'right',
    scrollBlock: 'center',
  },
  {
    target: '[data-tour="ask-harvey-button"]',
    title: 'A personal coach for every task',
    body: 'Every task has its own conversation with Harvey. Click here to get specific guidance, ask questions, or break a task into smaller steps — without losing context.',
    tooltipPosition: 'top',
    scrollBlock: 'center',
  },
]

// Step number of the paywall screen (not a spotlight step)
const PAYWALL_STEP = TOUR_STEPS.length + 1

// Layout constants
const TOOLTIP_MAX_WIDTH = 360
const TOOLTIP_EST_HEIGHT = 280
const CUTOUT_PADDING = 8
const EDGE_MARGIN = 16
// Delay (ms) after scrollIntoView before measuring element position
const SCROLL_SETTLE_MS = 600

// ============================================
// Helpers
// ============================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function computeTooltipStyle(
  position: TooltipPosition,
  rect: CutoutRect
): React.CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight

  let top: number
  let left: number

  if (position === 'left') {
    left = rect.left - EDGE_MARGIN - TOOLTIP_MAX_WIDTH
    top = rect.top + rect.height / 2 - TOOLTIP_EST_HEIGHT / 2
  } else if (position === 'right') {
    left = rect.left + rect.width + EDGE_MARGIN
    top = rect.top + rect.height / 2 - TOOLTIP_EST_HEIGHT / 2
  } else {
    // 'top'
    left = rect.left + rect.width / 2 - TOOLTIP_MAX_WIDTH / 2
    top = rect.top - EDGE_MARGIN - TOOLTIP_EST_HEIGHT
  }

  left = clamp(left, EDGE_MARGIN, vw - TOOLTIP_MAX_WIDTH - EDGE_MARGIN)
  top = clamp(top, EDGE_MARGIN, vh - TOOLTIP_EST_HEIGHT - EDGE_MARGIN)

  return {
    position: 'fixed',
    zIndex: 61,
    top,
    left,
    width: TOOLTIP_MAX_WIDTH,
    maxWidth: TOOLTIP_MAX_WIDTH,
  }
}

/** Entry slide direction offset (px) based on which side the tooltip sits on */
function entryTranslate(position: TooltipPosition, visible: boolean): string {
  if (!visible) {
    if (position === 'left') return 'translateX(8px)'
    if (position === 'right') return 'translateX(-8px)'
    return 'translateY(8px)'
  }
  return 'translate(0, 0)'
}

// ============================================
// Component
// ============================================

export default function GuidedTour({ onComplete, userId }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [cutoutRect, setCutoutRect] = useState<CutoutRect | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  const isPaywall = currentStep === PAYWALL_STEP

  /**
   * Scroll the target element into view, then after the scroll animation
   * settles measure its bounding rect and set cutoutRect.
   *
   * Pass scroll:false (resize handler) to skip scrolling and just remeasure.
   * Returns a cleanup function that cancels any pending setTimeout.
   */
  const calculateCutout = useCallback(
    (stepIndex: number, opts?: { scroll?: boolean }): (() => void) => {
      const step = TOUR_STEPS[stepIndex - 1]
      // No-op for out-of-range steps (e.g. paywall step)
      if (!step) return () => {}

      // All timeouts created during this call (retries + scroll settle) are tracked
      // here so a single cleanup can cancel the whole chain.
      const timeouts: ReturnType<typeof setTimeout>[] = []
      let cancelled = false

      const cleanup = () => {
        cancelled = true
        timeouts.forEach(clearTimeout)
      }

      const measure = (el: Element) => {
        if (cancelled) return
        const raw = el.getBoundingClientRect()
        setCutoutRect({
          top: raw.top - CUTOUT_PADDING,
          left: raw.left - CUTOUT_PADDING,
          width: raw.width + CUTOUT_PADDING * 2,
          height: raw.height + CUTOUT_PADDING * 2,
        })
      }

      const attempt = (retryCount: number) => {
        if (cancelled) return

        const el = document.querySelector(step.target)

        if (!el) {
          if (retryCount < 3) {
            // Element not yet in DOM — retry after 500ms, up to 3 times
            const t = setTimeout(() => attempt(retryCount + 1), 500)
            timeouts.push(t)
            return
          }
          // Still not found after 3 retries — skip or complete
          if (stepIndex < TOUR_STEPS.length) {
            setCurrentStep(stepIndex + 1)
          } else {
            onComplete()
          }
          return
        }

        const shouldScroll = opts?.scroll !== false
        if (shouldScroll) {
          if (stepIndex === 1) {
            // Step 1 targets the tall active-task card. Scrolling the element
            // into view leaves the title above the fold. Instead, reset the
            // right-panel scroll container to the very top so the card header
            // is always fully visible.
            const scrollContainer = document.querySelector('main.overflow-y-auto')
            if (scrollContainer) {
              scrollContainer.scrollTo({ top: 0, behavior: 'smooth' })
            }
          } else {
            el.scrollIntoView({ behavior: 'smooth', block: step.scrollBlock })
          }
          const t = setTimeout(() => measure(el), SCROLL_SETTLE_MS)
          timeouts.push(t)
        } else {
          measure(el)
        }
      }

      attempt(0)
      return cleanup
    },
    [onComplete]
  )

  // Step 1: initial mount — wait for dashboard to render, then scroll + measure
  useEffect(() => {
    let innerCleanup = () => {}
    const t = setTimeout(() => {
      innerCleanup = calculateCutout(1)
    }, 300)
    return () => {
      clearTimeout(t)
      innerCleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Steps 2+: triggered by step state change (paywall step is a no-op in calculateCutout)
  useEffect(() => {
    if (currentStep === 1) return // handled by mount effect
    const cleanup = calculateCutout(currentStep)
    return cleanup
  }, [currentStep, calculateCutout])

  // Resize: remeasure without scrolling (no-op on paywall step)
  useEffect(() => {
    const handleResize = () => calculateCutout(currentStep, { scroll: false })
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [currentStep, calculateCutout])

  // Fade-in animation for spotlight steps: trigger when cutoutRect is set
  useEffect(() => {
    if (!cutoutRect) {
      setIsVisible(false)
      return
    }
    const t = setTimeout(() => setIsVisible(true), 50)
    return () => clearTimeout(t)
  }, [cutoutRect])

  /**
   * Advance to the next spotlight step (steps 1–3), or animate into the
   * paywall when completing the last spotlight step (step 4).
   */
  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length) {
      // Normal step advance
      setCutoutRect(null)
      setCurrentStep((s) => s + 1)
    } else {
      // Last spotlight step → crossfade to paywall
      setIsVisible(false)
      setTimeout(() => {
        setCutoutRect(null)
        setCurrentStep(PAYWALL_STEP)
        // Let React commit the paywall render, then fade it in
        setTimeout(() => setIsVisible(true), 50)
      }, 300)
    }
  }

  /**
   * Unlock Harvey: open Stripe Payment Link with user ID, scroll to top, dismiss tour.
   */
  const handleUnlockClick = () => {
    const baseUrl = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK
    if (!baseUrl) {
      console.error('Stripe payment link not configured')
      return
    }
    if (!userId) {
      console.error('User ID not available for payment link')
      return
    }
    const paymentUrl = `${baseUrl}?client_reference_id=${encodeURIComponent(userId)}`
    window.open(paymentUrl, '_blank')

    const scrollContainer = document.querySelector('main.overflow-y-auto')
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' })
    }
    onComplete()
  }

  /**
   * Maybe later: scroll to top and dismiss tour.
   */
  const handlePaywallAction = (_action: 'pay' | 'skip') => {
    const scrollContainer = document.querySelector('main.overflow-y-auto')
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' })
    }
    onComplete()
  }

  // ============================================================
  // Paywall screen (step 5) — no spotlight, centered card
  // ============================================================

  if (isPaywall) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          padding: '0 16px',
        }}
      >
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: 24,
            padding: 40,
            maxWidth: 440,
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 32px 100px rgba(0,0,0,0.3)',
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'scale(1)' : 'scale(0.95)',
            transition: 'opacity 0.35s ease, transform 0.35s ease',
          }}
        >
          {/* Harvey avatar */}
          <div style={{ marginBottom: 20 }}>
            <Image
              src="/harvey/penguin-hat.png"
              alt="Harvey"
              width={80}
              height={80}
              style={{
                borderRadius: '50%',
                display: 'inline-block',
                outline: '4px solid rgba(137, 90, 246, 0.2)',
                outlineOffset: 2,
              }}
            />
          </div>

          {/* Headline */}
          <p
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#0f172a',
              marginBottom: 8,
              lineHeight: 1.3,
            }}
          >
            Harvey is ready to coach you
          </p>

          {/* Subheadline */}
          <p
            style={{
              fontSize: 14,
              color: '#94a3b8',
              marginBottom: 32,
              lineHeight: 1.6,
            }}
          >
            Get full access to your AI project coach for 3 months.
          </p>

          {/* Price block */}
          <div
            style={{
              backgroundColor: 'rgba(137, 90, 246, 0.05)',
              borderRadius: 16,
              padding: '24px 24px 20px',
              marginBottom: 32,
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontSize: 44,
                fontWeight: 700,
                color: '#895af6',
                lineHeight: 1,
              }}
            >
              $20
            </p>
            <p
              style={{
                fontSize: 13,
                color: '#94a3b8',
                marginTop: 4,
                marginBottom: 16,
              }}
            >
              for 3 months
            </p>
            <div
              style={{
                borderTop: '1px solid rgba(137, 90, 246, 0.1)',
                marginBottom: 16,
              }}
            />
            {[
              '✦ Unlimited AI coaching & scheduling',
              '✦ Per-task conversations with Harvey',
              '✦ Smart rescheduling that adapts to you',
            ].map((line) => (
              <p
                key={line}
                style={{
                  fontSize: 13,
                  color: '#475569',
                  lineHeight: 1.8,
                  textAlign: 'left',
                }}
              >
                {line}
              </p>
            ))}
          </div>

          {/* CTA button */}
          <button
            type="button"
            onClick={handleUnlockClick}
            style={{
              width: '100%',
              backgroundColor: '#895af6',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              padding: '14px 24px',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: 12,
              transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.backgroundColor = '#7c3aed'
              el.style.boxShadow = '0 8px 24px rgba(137, 90, 246, 0.35)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.backgroundColor = '#895af6'
              el.style.boxShadow = 'none'
            }}
          >
            Unlock Harvey
          </button>

          {/* Skip link */}
          <p
            onClick={() => handlePaywallAction('skip')}
            style={{
              fontSize: 13,
              color: '#94a3b8',
              cursor: 'pointer',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLParagraphElement).style.color = '#64748b'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLParagraphElement).style.color = '#94a3b8'
            }}
          >
            Maybe later
          </p>
        </div>
      </div>
    )
  }

  // ============================================================
  // Spotlight tour (steps 1–4)
  // ============================================================

  // Don't render spotlight until we have a measured rect
  if (!cutoutRect) return null

  const step = TOUR_STEPS[currentStep - 1]
  const tooltipStyle = computeTooltipStyle(step.tooltipPosition, cutoutRect)

  return (
    <>
      {/* Full-screen interaction blocker (behind cutout) */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 59,
          pointerEvents: 'all',
        }}
      />

      {/* Spotlight cutout — purple glow ring + dark overlay via box-shadow */}
      <div
        style={{
          position: 'fixed',
          zIndex: 60,
          top: cutoutRect.top,
          left: cutoutRect.left,
          width: cutoutRect.width,
          height: cutoutRect.height,
          borderRadius: 16,
          boxShadow: [
            '0 0 0 4px rgba(137, 90, 246, 0.4)',
            '0 0 24px 8px rgba(137, 90, 246, 0.15)',
            '0 0 0 9999px rgba(0, 0, 0, 0.7)',
          ].join(', '),
          pointerEvents: 'none',
          transition:
            'top 0.4s ease, left 0.4s ease, width 0.4s ease, height 0.4s ease, box-shadow 0.4s ease',
        }}
      />

      {/* Tooltip card */}
      <div
        style={{
          ...tooltipStyle,
          opacity: isVisible ? 1 : 0,
          transform: entryTranslate(step.tooltipPosition, isVisible),
          transition: 'opacity 0.3s ease, transform 0.3s ease',
        }}
      >
        {/* Card shell */}
        <div
          style={{
            position: 'relative',
            backgroundColor: 'white',
            borderRadius: 16,
            padding: 28,
            boxShadow: '0 24px 80px rgba(0,0,0,0.22), 0 4px 20px rgba(137,90,246,0.08)',
            border: '1px solid #f1f5f9',
          }}
        >
          {/* Arrow pointing toward highlighted element */}
          {step.tooltipPosition === 'left' && (
            <div
              style={{
                position: 'absolute',
                right: -10,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 0,
                height: 0,
                borderTop: '10px solid transparent',
                borderBottom: '10px solid transparent',
                borderLeft: '10px solid white',
              }}
            />
          )}
          {step.tooltipPosition === 'right' && (
            <div
              style={{
                position: 'absolute',
                left: -10,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 0,
                height: 0,
                borderTop: '10px solid transparent',
                borderBottom: '10px solid transparent',
                borderRight: '10px solid white',
              }}
            />
          )}
          {step.tooltipPosition === 'top' && (
            <div
              style={{
                position: 'absolute',
                bottom: -10,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '10px solid transparent',
                borderRight: '10px solid transparent',
                borderTop: '10px solid white',
              }}
            />
          )}

          {/* Top accent bar */}
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 9999,
              background: 'linear-gradient(to right, #895af6, #c084fc)',
              marginBottom: 16,
            }}
          />

          {/* Step counter */}
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#895af6',
              marginBottom: 8,
            }}
          >
            Step {currentStep} of {TOUR_STEPS.length}
          </p>

          {/* Title */}
          <p
            style={{
              fontSize: 19,
              fontWeight: 700,
              color: '#0f172a',
              lineHeight: 1.25,
              marginBottom: 12,
            }}
          >
            {step.title}
          </p>

          {/* Body */}
          <p
            style={{
              fontSize: 13,
              color: '#64748b',
              lineHeight: 1.7,
              marginBottom: 24,
            }}
          >
            {step.body}
          </p>

          {/* Footer: progress dots + button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {/* Progress dots — 4 dots, paywall not counted */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {TOUR_STEPS.map((_, i) => {
                const active = i + 1 === currentStep
                return (
                  <div
                    key={i}
                    style={{
                      width: active ? 10 : 8,
                      height: active ? 10 : 8,
                      borderRadius: '50%',
                      backgroundColor: active ? '#895af6' : '#e2e8f0',
                      transition: 'all 0.3s ease',
                    }}
                  />
                )
              })}
            </div>

            {/* Next / Got it button */}
            <button
              type="button"
              onClick={handleNext}
              style={{
                backgroundColor: '#895af6',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                padding: '10px 24px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.01em',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = '#7c3aed'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = '#895af6'
              }}
            >
              {currentStep < TOUR_STEPS.length ? 'Next →' : 'Got it ✓'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
