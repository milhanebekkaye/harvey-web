/**
 * Loading Page
 *
 * Shows Apple Intelligence-style animated loading state while "generating" schedule.
 * Features flowing gradient waves (Siri-style) that pulse and move organically.
 *
 * Flow:
 * - User arrives from onboarding after clicking "Build my schedule"
 * - Animation plays for 10 seconds with progress bar
 * - Auto-redirects to /dashboard
 */

'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function LoadingPage() {
  const router = useRouter()
  const [progress, setProgress] = useState(0)

  /**
   * Progress bar animation - updates every 100ms for 10 seconds
   */
  useEffect(() => {
    const duration = 10000 // 10 seconds
    const interval = 100 // Update every 100ms
    const increment = 100 / (duration / interval)

    const progressTimer = setInterval(() => {
      setProgress(prev => {
        const next = prev + increment
        if (next >= 100) {
          clearInterval(progressTimer)
          return 100
        }
        return next
      })
    }, interval)

    return () => clearInterval(progressTimer)
  }, [])

  /**
   * Auto-redirect to dashboard after 10 seconds
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/dashboard')
    }, 10000)

    return () => clearTimeout(timer)
  }, [router])

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

        .siri-blob {
          animation: blob-morph 8s ease-in-out infinite, blob-pulse 4s ease-in-out infinite;
        }

        .siri-blob-reverse {
          animation: blob-morph 10s ease-in-out infinite reverse, blob-pulse 5s ease-in-out infinite;
        }

        .color-animate {
          animation: color-shift 6s ease-in-out infinite;
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
              opacity: 0.95,
            }}
          />

          {/* Pink to orange accent on edge */}
          <div
            className="absolute w-[380px] h-[380px] siri-blob-reverse"
            style={{
              background: 'linear-gradient(180deg, #A855F7 0%, #D946EF 40%, #F472B6 70%, #FB923C 100%)',
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
              opacity: 0.7,
              animationDelay: '0.8s',
            }}
          />

          {/* Warm orange accent */}
          <div
            className="absolute w-[250px] h-[250px] siri-blob-reverse"
            style={{
              background: 'linear-gradient(45deg, #A855F7 0%, #E879F9 50%, #FB923C 100%)',
              filter: 'blur(55px)',
              opacity: 0.6,
              animationDelay: '1.2s',
            }}
          />

          {/* Core bright purple glow */}
          <div
            className="absolute w-[180px] h-[180px] siri-blob"
            style={{
              background: 'linear-gradient(135deg, #C084FC 0%, #A855F7 100%)',
              filter: 'blur(50px)',
              opacity: 0.85,
              animationDelay: '1.5s',
            }}
          />

          {/* Center bright glow */}
          <div className="absolute size-24 rounded-full bg-white/50 blur-2xl" />
        </div>

        {/* Typography */}
        <div className="max-w-md w-full text-center space-y-1">
          <h2 className="text-[#110d1c] tracking-tight text-2xl font-bold leading-tight">
            Building your schedule...
          </h2>
          <p className="text-[#110d1c]/70 text-base font-normal leading-normal px-8">
            Harvey is analyzing your tasks and priorities to create the perfect workflow.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mt-6 w-full max-w-[340px] flex flex-col gap-2">
          <div className="flex justify-between items-end">
            <p className="text-[#895af6] font-medium text-sm tracking-wide uppercase">Processing</p>
            <p className="text-[#110d1c]/50 text-sm font-medium">{Math.round(progress)}%</p>
          </div>
          <div className="h-2 w-full bg-[#895af6]/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#895af6] rounded-full shimmer-bar relative transition-all duration-100 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="material-symbols-outlined text-[#895af6] text-sm">bolt</span>
            <p className="text-[#110d1c]/60 text-xs font-medium italic">Optimizing for deep work phases</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 px-6 flex justify-center">
        <div className="flex items-center gap-2 opacity-30 select-none">
          <span className="material-symbols-outlined text-sm">security</span>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold">End-to-End Encrypted Data Analysis</p>
        </div>
      </footer>

      {/* Decorative background blurs */}
      <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-[#895af6]/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-[-10%] left-[-5%] w-[400px] h-[400px] bg-yellow-400/5 rounded-full blur-[100px] pointer-events-none" />
    </div>
  )
}