/**
 * Onboarding Vision Page
 *
 * Full-page rainbow gradient (same as signin). Three individual cards
 * (TODAY / TOMORROW / THE VISION) with alternating alignment; CTA "Almost there →"
 * redirects to /onboarding/closer.
 */

'use client'

import { Sparkles } from 'lucide-react'
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

const HEADLINE_STYLE: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: '#0d101b',
  lineHeight: 1.2,
  marginBottom: 10,
  marginTop: 2,
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
      const cached = sessionStorage.getItem('harvey_user_name')
      if (cached != null && cached.trim()) {
        setDisplayName(cached.trim())
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
          <p style={HEADLINE_STYLE}>No more blank screen.</p>
          <p style={BODY_STYLE}>
            Every time you open Harvey, you know exactly what to do next. Not a vague to-do list, a precise next step. Built around your project and your day. You stop planning. You start shipping.
          </p>
        </div>

        <div style={{ ...CARD_STYLE, alignSelf: 'flex-end' }}>
          <p style={EYEBROW_STYLE}>TOMORROW</p>
          <p style={HEADLINE_STYLE}>Harvey learns how you actually work.</p>
          <p style={BODY_STYLE}>
            You say mornings. You skip mornings. Harvey notices. It adapts. It learns your real productive windows, how long your tasks actually take, what patterns make you ship. Every week, your schedule gets sharper.
          </p>
        </div>

        <div style={{ ...CARD_STYLE, alignSelf: 'flex-start' }}>
          <p style={EYEBROW_STYLE}>THE VISION</p>
          <p style={HEADLINE_STYLE}>The AI co-founder you never had.</p>
          <p style={BODY_STYLE}>
An AI that knows your projects, your goals, your constraints, your patterns. It tells you what to build next, warns you when you're off track, helps you think through hard decisions. Not a productivity app. A real partner for your entrepreneurial life. That's where Harvey is going.          </p>
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
