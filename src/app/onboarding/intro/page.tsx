/**
 * Onboarding Intro Page (Screen 2) — Multi-slide
 *
 * Shown after /onboarding/welcome and before /onboarding/questions.
 * Three slides with horizontal transition; same full-page rainbow gradient.
 */

'use client'

import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { getSession } from '@/lib/auth/auth-service'

const TEXT_CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.7)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
  borderRadius: 24,
  padding: 40,
  width: 420,
  boxShadow:
    '0 0 80px 20px rgba(168,85,247,0.15), 0 8px 32px rgba(0,0,0,0.08)',
}

const IMAGE_CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.7)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
  borderRadius: 24,
  padding: 16,
  width: 420,
  boxShadow:
    '0 0 80px 20px rgba(168,85,247,0.12), 0 8px 32px rgba(0,0,0,0.08)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const SLIDE_TRANSITION = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)'

function SlideContent({
  eyebrow,
  headline,
  subheadline,
  body,
  imageSrc,
  imageAlt,
  imageContain,
  reverse,
}: {
  eyebrow: string
  headline: string
  subheadline?: string
  body: string
  imageSrc: string
  imageAlt: string
  imageContain?: boolean
  reverse?: boolean
}) {
  const textBlock = (
    <div style={TEXT_CARD_STYLE}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#425ff0] mb-2">
        {eyebrow}
      </p>
      <h2 className="text-[28px] font-bold leading-tight text-[#0d101b] mb-3">
        {headline}
      </h2>
      {subheadline && (
        <p className="text-[17px] font-semibold text-[#0d101b] leading-snug mb-3">
          {subheadline}
        </p>
      )}
      <p className="text-[15px] text-slate-500 leading-relaxed">
        {body}
      </p>
    </div>
  )
  const imageBlock = (
    <div style={IMAGE_CARD_STYLE}>
      <div className="w-full overflow-hidden" style={{ borderRadius: 16 }}>
        <Image
          src={imageSrc}
          alt={imageAlt}
          width={388}
          height={280}
          className="w-full"
          style={{
            height: 280,
            objectFit: imageContain ? 'contain' : 'cover',
          }}
        />
      </div>
    </div>
  )
  return (
    <div
      className="absolute inset-0 flex items-center justify-center gap-12"
      style={{
        padding: '0 80px',
        gap: 48,
      }}
    >
      {reverse ? (
        <>
          {imageBlock}
          {textBlock}
        </>
      ) : (
        <>
          {textBlock}
          {imageBlock}
        </>
      )}
    </div>
  )
}

export default function OnboardingIntroPage() {
  const router = useRouter()
  const [currentSlide, setCurrentSlide] = useState(0)
  const [displayName, setDisplayName] = useState<string>('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadName() {
      const cached = sessionStorage.getItem('harvey_user_name')
      if (cached != null && cached.trim()) {
        setDisplayName(cached.trim())
        setMounted(true)
        return
      }
      try {
        const res = await fetch('/api/user/me')
        if (cancelled || !res.ok) return
        const data = await res.json().catch(() => ({}))
        if (data.name && typeof data.name === 'string' && data.name.trim()) {
          setDisplayName(data.name.trim())
          return
        }
      } catch {
        // fallback below
      }
      const session = await getSession()
      if (cancelled || !session?.user) return
      const name =
        (session.user.user_metadata?.name as string) ||
        (session.user.user_metadata?.full_name as string) ||
        'there'
      setDisplayName(name)
    }
    loadName()
    setMounted(true)
    return () => {
      cancelled = true
    }
  }, [])

  const handleNext = () => {
    if (currentSlide === 2) {
      router.push('/onboarding/questions')
    } else {
      setCurrentSlide((s) => s + 1)
    }
  }

  return (
    <div className="font-display bg-[#FAF9F6] h-screen min-h-screen flex flex-col overflow-hidden relative">
      <div className="aurora-bg" aria-hidden />
      <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-20 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-[#425ff0]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      {/* Top: Harvey logo (same as auth page) */}
      <div className="relative z-20 flex-shrink-0 pt-6 flex flex-col items-center">
        <div className="size-12 bg-[#425ff0] rounded-xl flex items-center justify-center text-white shadow-lg shadow-[#425ff0]/20">
          <Sparkles className="w-8 h-8" />
        </div>
        <span className="text-xl font-bold tracking-tight text-slate-900 mt-2">
          Harvey
        </span>
      </div>

      {/* Slides: overflow hidden, full remaining height */}
      <div className="relative z-10 flex-1 min-h-0 w-full overflow-hidden">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="absolute inset-0 w-full"
            style={{
              transform: `translateX(${(index - currentSlide) * 100}%)`,
              transition: SLIDE_TRANSITION,
            }}
          >
            {index === 0 && (
              <SlideContent
                eyebrow="THE PROBLEM"
                headline={mounted ? `Sound familiar, ${displayName}?` : 'Sound familiar?'}
                subheadline="You know exactly what you want to build. So why aren't you building it?"
                body="Too many ideas. Too many things on your mind. But when it's time to sit down and work — you freeze. You don't know where to start, so you lose an hour just thinking about it. Or worse, you do nothing at all."
                imageSrc="/onboarding/illustration-problem.png"
                imageAlt="Illustration of the problem"
                imageContain
                reverse={false}
              />
            )}
            {index === 1 && (
              <div
                className="absolute inset-0 w-full flex flex-row items-center justify-center"
                style={{
                  padding: '20px 60px',
                  gap: 40,
                }}
              >
                {/* Left (45%): text card */}
                <div
                  className="min-w-0"
                  style={{
                    width: '45%',
                    background: 'rgba(255,255,255,0.75)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.9)',
                    borderRadius: 24,
                    padding: 36,
                    boxShadow:
                      '0 0 60px 10px rgba(168,85,247,0.15), 0 8px 32px rgba(0,0,0,0.08)',
                  }}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#425ff0] mb-2">
                    HARVEY&apos;S ANSWER
                  </p>
                  <h2 className="text-[24px] font-bold leading-tight text-[#0d101b] mb-3">
                    Just ask. Harvey tells you exactly what to do.
                  </h2>
                  <div className="text-[14px] text-slate-500 leading-relaxed space-y-3">
                    <p>
                      Harvey doesn't just tell you what to do. It tells you how to think about it.
                    </p>

                    <p>
                      30 minutes free? Harvey knows your full project, your schedule, and what matters most right now.
                    </p>

                    <p>
                      It doesn't give you a generic answer — it gives you the right move, explained.
                    </p>
                  </div>
                </div>
                {/* Right (45%): image card */}
                <div
                  className="min-w-0 flex items-center justify-center"
                  style={{
                    width: '45%',
                    background: 'rgba(255,255,255,0.75)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.9)',
                    borderRadius: 24,
                    padding: 12,
                    boxShadow:
                      '0 0 60px 10px rgba(168,85,247,0.15), 0 8px 32px rgba(0,0,0,0.08)',
                  }}
                >
                  <div
                    className="overflow-hidden flex items-center justify-center"
                    style={{
                      borderRadius: 16,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                    }}
                  >
                    <Image
                      src="/onboarding/screenshot-chat.png"
                      alt="Harvey chat screenshot"
                      width={400}
                      height={480}
                      className="object-contain"
                      style={{ maxHeight: 480, width: 'auto' }}
                    />
                  </div>
                </div>
              </div>
            )}
            {index === 2 && (
              <div
                className="absolute inset-0 w-full overflow-hidden"
                style={{ position: 'relative', width: '100%', height: '100%' }}
              >
                {/* Screenshot: right side, with browser mockup bar */}
                <div
                  className="absolute overflow-hidden"
                  style={{
                    right: 40,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '62%',
                    borderRadius: 20,
                    boxShadow: '0 24px 80px rgba(0,0,0,0.15)',
                    border: '1px solid rgba(255,255,255,0.5)',
                  }}
                >
                  <div
                    className="flex items-center"
                    style={{
                      height: 32,
                      background: '#F0F0F0',
                      padding: '0 14px',
                      gap: 6,
                    }}
                  >
                    <span
                      className="rounded-full"
                      style={{ width: 10, height: 10, backgroundColor: '#FF5F57' }}
                    />
                    <span
                      className="rounded-full"
                      style={{ width: 10, height: 10, backgroundColor: '#FEBC2E' }}
                    />
                    <span
                      className="rounded-full"
                      style={{ width: 10, height: 10, backgroundColor: '#28C840' }}
                    />
                  </div>
                  <Image
                    src="/onboarding/screenshot-timeline.png"
                    alt="App screenshot: chat sidebar and timeline"
                    width={900}
                    height={600}
                    className="w-full block rounded-none"
                    style={{ borderRadius: 0 }}
                  />
                </div>
                {/* Text: top left, no card */}
                <div
                  className="absolute"
                  style={{ top: 48, left: 48, width: '28%' }}
                >
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      color: '#8B5CF6',
                      textTransform: 'uppercase',
                    }}
                  >
                    THE DETAILS
                  </p>
                  <div
                    style={{
                      borderLeft: '3px solid #8B5CF6',
                      paddingLeft: 12,
                    }}
                  >
                    <h2
                      style={{
                        fontSize: 26,
                        fontWeight: 800,
                        color: '#111827',
                        lineHeight: 1.15,
                        marginTop: 10,
                      }}
                    >
                      Every Task
                      <br />
                      Everything's already figured out.
                    </h2>
                  </div>
                  <p
                    style={{
                      fontSize: 14,
                      color: '#9CA3AF',
                      marginTop: 14,
                      lineHeight: 1.6,
                    }}
                  >
                    Description, success criteria, dependencies, Harvey&apos;s coaching tip. Every task arrives ready to execute — no planning required on your end.
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom navigation: dots + CTA */}
      <div
        className="relative z-20 flex-shrink-0 flex flex-col items-center gap-4"
        style={{ paddingBottom: 32 }}
      >
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-full transition-colors"
              style={{
                width: 8,
                height: 8,
                backgroundColor: currentSlide === i ? '#425ff0' : '#e2e8f0',
              }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={handleNext}
          className="h-12 px-8 bg-[#425ff0] hover:bg-[#425ff0]/90 text-white rounded-lg transition-all duration-200 font-bold text-base shadow-lg shadow-[#425ff0]/20 flex items-center justify-center gap-2"
        >
          {currentSlide === 2 ? "I'm ready →" : 'Next →'}
        </button>
      </div>
    </div>
  )
}
