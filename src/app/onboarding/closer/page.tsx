/**
 * Onboarding Closer Page
 *
 * Full-page rainbow gradient (same as signin). Single card with personalized
 * closer copy; CTA "Let's build something →" redirects to /onboarding.
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth/auth-service'

const CARD_STYLE: React.CSSProperties = {
  maxWidth: 640,
  width: '100%',
  background: 'rgba(255,255,255,0.75)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
  borderRadius: 28,
  padding: '52px 48px',
  boxShadow:
    '0 0 80px 20px rgba(168,85,247,0.18), 0 8px 40px rgba(0,0,0,0.08)',
}

const PURPLE = '#425ff0'

export default function OnboardingCloserPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState<string>('')

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
      className="font-display bg-[#FAF9F6] min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ padding: 40 }}
    >
      <div className="aurora-bg" aria-hidden />
      <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-20 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-[#425ff0]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      {/* Harvey logo at top, outside card */}
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

      <div className="relative z-10 w-full flex flex-col items-center" style={{ padding: '0 40px' }}>
        <div style={CARD_STYLE}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: '#8B5CF6',
              textTransform: 'uppercase',
            }}
          >
            YOU&apos;RE EARLY
          </p>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: '#111827',
              lineHeight: 1.15,
              marginTop: 12,
              borderLeft: '3px solid #8B5CF6',
              paddingLeft: 16,
            }}
          >
            {displayName ? `${displayName}, you're one of the first.` : "You're one of the first."}
          </h2>
          <p
            style={{
              fontSize: 16,
              color: '#6B7280',
              lineHeight: 1.8,
              marginTop: 20,
            }}
          >
            Harvey is being built right now. What you do with it, what breaks,
            what you love — that directly shapes what it becomes. You&apos;re
            not just a user. You&apos;re a co-builder.
          </p>
          <div
            style={{
              marginTop: 32,
              height: 1,
              background: 'linear-gradient(to right, rgba(139,92,246,0.3), transparent)',
            }}
          />
          <button
            type="button"
            onClick={() => router.push('/onboarding')}
            className="w-full h-12 px-5 rounded-lg transition-all duration-200 font-bold text-base shadow-lg flex items-center justify-center gap-2 text-white mt-8"
            style={{
              backgroundColor: PURPLE,
              boxShadow: `0 10px 15px -3px ${PURPLE}33`,
            }}
          >
            Let&apos;s build something →
          </button>
        </div>
      </div>
    </div>
  )
}
