'use client'

import { useState, useEffect, useCallback } from 'react'

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
}

interface GuidedTourProps {
  onComplete: () => void
}

// ============================================
// Step definitions
// ============================================

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="active-task"]',
    title: 'Your first task is ready',
    body: "Harvey broke down your project into clear, executable tasks. This is your current task — with everything you need to get started: description, success criteria, and Harvey's coaching tip.",
    tooltipPosition: 'left',
  },
  {
    target: '[data-tour="chat-sidebar"]',
    title: 'Harvey is always here',
    body: 'This is your direct line to Harvey. Ask him to reschedule tasks, change your availability, get a progress summary, or figure out what to work on next.',
    tooltipPosition: 'right',
  },
  {
    target: '[data-tour="ask-harvey-button"]',
    title: 'A personal coach for every task',
    body: 'Every task has its own conversation with Harvey. Click here to get specific guidance, ask questions, or break a task into smaller steps — without losing context.',
    tooltipPosition: 'top',
  },
]

// Tooltip sizing constants for positioning calculations
const TOOLTIP_MAX_WIDTH = 340
const TOOLTIP_EST_HEIGHT = 250
const CUTOUT_PADDING = 8
const EDGE_MARGIN = 16

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

  // Clamp to keep tooltip on-screen
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

// ============================================
// Component
// ============================================

export default function GuidedTour({ onComplete }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [cutoutRect, setCutoutRect] = useState<CutoutRect | null>(null)

  const calculateCutout = useCallback(
    (stepIndex: number) => {
      const step = TOUR_STEPS[stepIndex - 1]
      if (!step) return

      const el = document.querySelector(step.target)
      if (!el) {
        // Element not found — skip forward or complete
        if (stepIndex < TOUR_STEPS.length) {
          setCurrentStep(stepIndex + 1)
        } else {
          onComplete()
        }
        return
      }

      const raw = el.getBoundingClientRect()
      setCutoutRect({
        top: raw.top - CUTOUT_PADDING,
        left: raw.left - CUTOUT_PADDING,
        width: raw.width + CUTOUT_PADDING * 2,
        height: raw.height + CUTOUT_PADDING * 2,
      })
    },
    [onComplete]
  )

  // Initial mount: small delay so dashboard has fully rendered
  useEffect(() => {
    const t = setTimeout(() => calculateCutout(currentStep), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recalculate when step changes (not on mount — handled above)
  useEffect(() => {
    if (currentStep === 1) return // mount effect handles step 1
    calculateCutout(currentStep)
  }, [currentStep, calculateCutout])

  // Recalculate on window resize
  useEffect(() => {
    const handleResize = () => calculateCutout(currentStep)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [currentStep, calculateCutout])

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length) {
      setCutoutRect(null) // clear so we don't flash the old rect while animating
      setCurrentStep((s) => s + 1)
    } else {
      onComplete()
    }
  }

  // Don't render until we have a rect
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

      {/* Spotlight cutout — box-shadow darkens everything outside */}
      <div
        style={{
          position: 'fixed',
          zIndex: 60,
          top: cutoutRect.top,
          left: cutoutRect.left,
          width: cutoutRect.width,
          height: cutoutRect.height,
          borderRadius: 16,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
          pointerEvents: 'none',
          transition: 'top 0.4s ease, left 0.4s ease, width 0.4s ease, height 0.4s ease',
        }}
      />

      {/* Tooltip card */}
      <div style={tooltipStyle}>
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          }}
        >
          {/* Title */}
          <p
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: '#0f172a',
              marginBottom: 10,
              lineHeight: 1.3,
            }}
          >
            {step.title}
          </p>

          {/* Body */}
          <p
            style={{
              fontSize: 13,
              color: '#475569',
              lineHeight: 1.65,
              marginBottom: 20,
            }}
          >
            {step.body}
          </p>

          {/* Footer: dots + button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {/* Progress dots */}
            <div style={{ display: 'flex', gap: 6 }}>
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    backgroundColor: i + 1 === currentStep ? '#895af6' : '#D1D5DB',
                    transition: 'background-color 0.3s',
                  }}
                />
              ))}
            </div>

            {/* Next / Got it button */}
            <button
              type="button"
              onClick={handleNext}
              style={{
                backgroundColor: '#895af6',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '10px 24px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.01em',
              }}
            >
              {currentStep < TOUR_STEPS.length ? 'Next' : 'Got it'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
