/**
 * Loading Page
 *
 * Shows Apple Intelligence-style animated loading state while generating schedule.
 * Features flowing gradient waves (Siri-style) that pulse and move organically.
 *
 * Flow:
 * - User arrives from onboarding after clicking "Build my schedule"
 * - projectId is extracted from URL search params
 * - Calls POST /api/generate-schedule with projectId
 * - Shows animated progress while waiting for API response
 * - On success: redirects to /dashboard
 * - On error: shows error message with retry button
 */

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useCallback, Suspense, useRef } from 'react'
import type { GenerateScheduleResponse } from '@/lib/types/api.types'

/**
 * Loading states for the page
 */
type LoadingState = 'loading' | 'success' | 'error'

/**
 * Inner component that uses useSearchParams (must be wrapped in Suspense)
 */
function LoadingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Get projectId from URL params (passed from onboarding page)
  const projectId = searchParams.get('projectId')

  // State management
  const [state, setState] = useState<LoadingState>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [taskCount, setTaskCount] = useState<number>(0)

  // Ref to prevent double API calls from React Strict Mode
  const hasStartedRef = useRef(false)

  /**
   * Call the generate-schedule API
   *
   * Extracts constraints from conversation and generates tasks.
   * On success, redirects to dashboard.
   */
  const generateSchedule = useCallback(async () => {
    // Reset state for retry
    setState('loading')
    setErrorMessage('')

    // Validate projectId
    if (!projectId) {
      console.error('[LoadingPage] No projectId provided')
      setState('error')
      setErrorMessage('No project found. Please start from the beginning.')
      return
    }

    console.log('[LoadingPage] Starting schedule generation for project:', projectId)

    try {
      const response = await fetch('/api/generate-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })

      const data: GenerateScheduleResponse = await response.json()

      if (!response.ok || !data.success) {
        console.error('[LoadingPage] API error:', data.error)
        setState('error')
        setErrorMessage(data.error || 'Failed to generate schedule')
        return
      }

      console.log('[LoadingPage] Schedule generated successfully!')
      console.log('[LoadingPage] Task count:', data.taskCount)
      if (data.milestones) {
        console.log('[LoadingPage] Milestones:', data.milestones)
      }

      // Success! Update state and redirect
      setState('success')
      setTaskCount(data.taskCount || 0)

      // Short delay to show success state before redirect
      setTimeout(() => {
        router.push('/dashboard')
      }, 1500)
    } catch (error) {
      console.error('[LoadingPage] Network error:', error)
      setState('error')
      setErrorMessage('Network error. Please check your connection and try again.')
    }
  }, [projectId, router])

  /**
   * Start schedule generation on mount
   * Uses ref guard to prevent double calls from React Strict Mode
   */
  useEffect(() => {
    if (hasStartedRef.current) {
      console.log('[LoadingPage] Skipping duplicate call (React Strict Mode)')
      return
    }
    hasStartedRef.current = true
    generateSchedule()
  }, [generateSchedule])

  /**
   * Handle retry button click
   * Resets the ref guard to allow the API call
   */
  const handleRetry = () => {
    hasStartedRef.current = false
    generateSchedule()
  }

  /**
   * Handle go back button click
   */
  const handleGoBack = () => {
    router.push('/onboarding')
  }

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#FAF9F6]">
      {/* Apple Intelligence style animation CSS */}
      <style>{`
        @keyframes blob-morph {
          0%, 100% {
            border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
            transform: rotate(0deg) scale(1);
          }
          25% {
            border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%;
            transform: rotate(90deg) scale(1.05);
          }
          50% {
            border-radius: 50% 60% 30% 60% / 30% 40% 70% 50%;
            transform: rotate(180deg) scale(0.95);
          }
          75% {
            border-radius: 60% 40% 60% 30% / 70% 50% 40% 60%;
            transform: rotate(270deg) scale(1.02);
          }
        }

        @keyframes blob-pulse {
          0%, 100% {
            opacity: 0.85;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.08);
          }
        }

        @keyframes color-shift {
          0%, 100% {
            filter: hue-rotate(0deg) blur(60px);
          }
          50% {
            filter: hue-rotate(30deg) blur(65px);
          }
        }

        @keyframes indeterminate {
          0% {
            left: -40%;
            width: 40%;
          }
          50% {
            left: 30%;
            width: 40%;
          }
          100% {
            left: 100%;
            width: 40%;
          }
        }

        @keyframes pulse-glow {
          0%, 100% {
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
        }

        .siri-blob {
          animation: blob-morph 8s ease-in-out infinite, blob-pulse 4s ease-in-out infinite;
        }

        .siri-blob-reverse {
          animation: blob-morph 10s ease-in-out infinite reverse, blob-pulse 5s ease-in-out infinite;
        }

        .color-animate {
          animation: color-shift 6s ease-in-out infinite;
        }

        .indeterminate-bar {
          animation: indeterminate 1.5s ease-in-out infinite;
        }

        .pulse-text {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>

      {/* Header with logo and avatar */}
      <header className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="size-6 text-[#895af6]">
            <svg fill="currentColor" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4H17.3334V17.3334H30.6666V30.6666H44V44H4V4Z" />
            </svg>
          </div>
          <h2 className="text-[#110d1c] text-lg font-bold tracking-tight">Harvey AI</h2>
        </div>
        <div className="flex items-center gap-4">
          <div
            className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 border border-black/5"
            style={{ backgroundColor: '#E5E7EB' }}
          />
        </div>
      </header>

      {/* Main Loading Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-0 -mt-8">
        {/* Siri-style flowing gradient waves container */}
        <div className="relative w-[640px] h-[640px] -mb-16 flex items-center justify-center">
          {/* Main purple base blob */}
          <div
            className="absolute w-[400px] h-[400px] siri-blob"
            style={{
              background: 'linear-gradient(135deg, #A855F7 0%, #8B5CF6 50%, #7C3AED 100%)',
              filter: 'blur(70px)',
              opacity: state === 'error' ? 0.5 : 0.95,
            }}
          />

          {/* Pink to orange accent on edge */}
          <div
            className="absolute w-[380px] h-[380px] siri-blob-reverse"
            style={{
              background:
                state === 'error'
                  ? 'linear-gradient(180deg, #EF4444 0%, #F97316 50%, #FB923C 100%)'
                  : state === 'success'
                    ? 'linear-gradient(180deg, #22C55E 0%, #10B981 50%, #059669 100%)'
                    : 'linear-gradient(180deg, #A855F7 0%, #D946EF 40%, #F472B6 70%, #FB923C 100%)',
              filter: 'blur(65px)',
              opacity: 0.75,
              animationDelay: '0.3s',
            }}
          />

          {/* Blue to purple accent */}
          <div
            className="absolute w-[320px] h-[320px] siri-blob"
            style={{
              background: 'linear-gradient(225deg, #8B5CF6 0%, #A855F7 50%, #818CF8 100%)',
              filter: 'blur(60px)',
              opacity: state === 'error' ? 0.4 : 0.7,
              animationDelay: '0.8s',
            }}
          />

          {/* Warm orange accent */}
          <div
            className="absolute w-[250px] h-[250px] siri-blob-reverse"
            style={{
              background: 'linear-gradient(45deg, #A855F7 0%, #E879F9 50%, #FB923C 100%)',
              filter: 'blur(55px)',
              opacity: state === 'error' ? 0.3 : 0.6,
              animationDelay: '1.2s',
            }}
          />

          {/* Core bright purple glow */}
          <div
            className="absolute w-[180px] h-[180px] siri-blob"
            style={{
              background:
                state === 'success'
                  ? 'linear-gradient(135deg, #86EFAC 0%, #22C55E 100%)'
                  : 'linear-gradient(135deg, #C084FC 0%, #A855F7 100%)',
              filter: 'blur(50px)',
              opacity: 0.85,
              animationDelay: '1.5s',
            }}
          />

          {/* Center bright glow */}
          <div className="absolute size-24 rounded-full bg-white/50 blur-2xl" />
        </div>

        {/* Typography - changes based on state */}
        <div className="max-w-md w-full text-center space-y-1">
          {state === 'loading' && (
            <>
              <h2 className="text-[#110d1c] tracking-tight text-2xl font-bold leading-tight">
                Building your schedule...
              </h2>
              <p className="text-[#110d1c]/70 text-base font-normal leading-normal px-8">
                Harvey is analyzing your tasks and priorities to create the perfect workflow.
              </p>
            </>
          )}

          {state === 'success' && (
            <>
              <h2 className="text-[#110d1c] tracking-tight text-2xl font-bold leading-tight">
                Schedule ready!
              </h2>
              <p className="text-[#110d1c]/70 text-base font-normal leading-normal px-8">
                Created {taskCount} tasks for your project. Redirecting to dashboard...
              </p>
            </>
          )}

          {state === 'error' && (
            <>
              <h2 className="text-[#110d1c] tracking-tight text-2xl font-bold leading-tight">
                Something went wrong
              </h2>
              <p className="text-red-500/80 text-base font-normal leading-normal px-8">
                {errorMessage}
              </p>
            </>
          )}
        </div>

        {/* Progress Bar / Actions based on state */}
        <div className="mt-6 w-full max-w-[340px] flex flex-col gap-2">
          {state === 'loading' && (
            <>
              {/* Indeterminate progress bar */}
              <div className="flex justify-between items-end">
                <p className="text-[#895af6] font-medium text-sm tracking-wide uppercase pulse-text">
                  Processing
                </p>
              </div>
              <div className="h-2 w-full bg-[#895af6]/10 rounded-full overflow-hidden relative">
                <div className="h-full bg-[#895af6] rounded-full absolute indeterminate-bar" />
              </div>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="material-symbols-outlined text-[#895af6] text-sm">bolt</span>
                <p className="text-[#110d1c]/60 text-xs font-medium italic">
                  Optimizing for deep work phases
                </p>
              </div>
            </>
          )}

          {state === 'success' && (
            <>
              {/* Full progress bar */}
              <div className="flex justify-between items-end">
                <p className="text-green-500 font-medium text-sm tracking-wide uppercase">
                  Complete
                </p>
                <p className="text-[#110d1c]/50 text-sm font-medium">100%</p>
              </div>
              <div className="h-2 w-full bg-green-500/10 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full w-full transition-all duration-500" />
              </div>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="material-symbols-outlined text-green-500 text-sm">
                  check_circle
                </span>
                <p className="text-[#110d1c]/60 text-xs font-medium italic">
                  {taskCount} tasks created
                </p>
              </div>
            </>
          )}

          {state === 'error' && (
            <>
              {/* Error actions */}
              <div className="flex flex-col gap-3 mt-4">
                <button
                  onClick={handleRetry}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-[#895af6] text-white font-semibold rounded-xl hover:bg-[#7c4ee0] transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">refresh</span>
                  Try again
                </button>
                <button
                  onClick={handleGoBack}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-transparent text-[#110d1c]/60 font-medium rounded-xl hover:bg-black/5 transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">arrow_back</span>
                  Go back to onboarding
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 px-6 flex justify-center">
        <div className="flex items-center gap-2 opacity-30 select-none">
          <span className="material-symbols-outlined text-sm">security</span>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold">
            End-to-End Encrypted Data Analysis
          </p>
        </div>
      </footer>

      {/* Decorative background blurs */}
      <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-[#895af6]/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-[-10%] left-[-5%] w-[400px] h-[400px] bg-yellow-400/5 rounded-full blur-[100px] pointer-events-none" />
    </div>
  )
}

/**
 * Loading Page Component
 *
 * Wrapped in Suspense because useSearchParams requires it in Next.js 14.
 */
export default function LoadingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-[#FAF9F6]">
          <div className="text-[#895af6]">Loading...</div>
        </div>
      }
    >
      <LoadingContent />
    </Suspense>
  )
}
