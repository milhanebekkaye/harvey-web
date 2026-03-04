/**
 * Onboarding Vision Page
 *
 * Full-page rainbow gradient (same as signin). Three individual cards
 * (TODAY / TOMORROW / THE VISION) with alternating alignment; CTA "Almost there →"
 * redirects to /onboarding/closer.
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth/auth-service'

const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.75)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
  borderRadius: 24,
  padding: '32px 40px',
  boxShadow:
    '0 0 60px 10px rgba(168,85,247,0.15), 0 8px 32px rgba(0,0,0,0.08)',
  maxWidth: 580,
}

const EYEBROW_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.18em',
  color: '#8B5CF6',
  textTransform: 'uppercase',
  marginBottom: 10,
}

const BODY_STYLE: React.CSSProperties = {
  fontSize: 15,
  color: '#374151',
  lineHeight: 1.75,
}

const PURPLE = '#425ff0'

export default function OnboardingVisionPage() {
  const router = useRouter()
  const [, setDisplayName] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    async function loadName() {
      const session = await getSession()
      if (cancelled || !session?.user) return
      const name =
        (session.user.user_metadata?.name as string) ||
        (session.user.user_metadata?.full_name as string) ||
        session.user.email?.split('@')[0] ||
        'there'
      setDisplayName(name)
    }
    loadName()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div
      className="font-display bg-[#FAF9F6] min-h-screen flex flex-col items-center relative overflow-hidden"
      style={{ padding: 40 }}
    >
      <div className="aurora-bg" aria-hidden />
      <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-20 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-[#425ff0]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      {/* Harvey logo at top */}
      <div className="relative z-20 flex-shrink-0 pt-6 flex flex-col items-center mb-6">
        <div
          className="size-12 rounded-xl flex items-center justify-center text-white shadow-lg"
          style={{ backgroundColor: PURPLE, boxShadow: `0 10px 15px -3px ${PURPLE}33` }}
        >
          <span className="material-symbols-outlined text-3xl">auto_awesome</span>
        </div>
        <span className="text-xl font-bold tracking-tight text-slate-900 mt-2">
          Harvey
        </span>
      </div>

      {/* Main content: three cards + CTA */}
      <div
        className="relative z-10 flex flex-col"
        style={{
          gap: 20,
          padding: '20px 80px',
          width: '100%',
          maxWidth: 860,
          margin: '0 auto',
        }}
      >
        <div style={{ ...CARD_STYLE, alignSelf: 'flex-start' }}>
          <p style={EYEBROW_STYLE}>TODAY</p>
          <p style={BODY_STYLE}>
            You open Harvey, you have 30 minutes. You ask what to do. Harvey
            knows your entire project — every task, every dependency, every
            deadline. It tells you exactly where to start. You execute.
          </p>
        </div>

        <div style={{ ...CARD_STYLE, alignSelf: 'flex-end' }}>
          <p style={EYEBROW_STYLE}>TOMORROW</p>
          <p style={BODY_STYLE}>
            Harvey tracks your energy patterns, your productive hours, your
            workout schedule. It knows you skip Fridays, that you code better at
            night, that you need 20 minutes to warm up. Your schedule adapts to
            you — not the other way around.
          </p>
        </div>

        <div style={{ ...CARD_STYLE, alignSelf: 'flex-start' }}>
          <p style={EYEBROW_STYLE}>THE VISION</p>
          <p style={BODY_STYLE}>
            One AI that knows your projects, your health, your goals, your life.
            Not just a productivity tool — your personal entrepreneur OS. The
            unfair advantage that top founders will have in 5 years. You&apos;re
            getting it now.
          </p>
        </div>

        <div className="flex justify-center" style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => router.push('/onboarding/closer')}
            className="h-12 px-8 rounded-lg transition-all duration-200 font-bold text-base shadow-lg flex items-center justify-center gap-2 text-white"
            style={{
              backgroundColor: PURPLE,
              boxShadow: `0 10px 15px -3px ${PURPLE}33`,
            }}
          >
            Almost there →
          </button>
        </div>
      </div>
    </div>
  )
}
