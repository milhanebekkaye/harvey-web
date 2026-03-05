/**
 * Onboarding Questions Page
 *
 * Screen 2 after welcome: 6 questions (reason, current work, work style, biggest challenge, coaching style, experience level).
 * Same visual style as signin/welcome. On completion, PATCH /api/user/onboarding then redirect to /onboarding/vision.
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'

const PURPLE = '#425ff0'

const Q1_OPTIONS = [
  'I want to finally ship my side project',
  'I keep starting things and not finishing',
  'I spend more time planning than building',
  'I need someone to keep me accountable',
  "I'm juggling too many things at once",
]

const Q3_OPTIONS = [
  'Evenings after work or school',
  'Weekends mostly',
  'Whenever I find a gap',
  'I have dedicated blocks but ignore them',
]

const Q4_OPTIONS = [
  'Decision paralysis',
  'Staying consistent',
  'Knowing where to start',
  'Managing multiple projects',
  'Other',
]

const Q5_OPTIONS = [
  'Be direct, just tell me what to do',
  'Help me think it through',
  'Push me hard, don\'t let me make excuses',
  'Be encouraging, I need motivation',
]

const Q6_OPTIONS = [
  'First time building something',
  "I've built things but never finished",
  "I've shipped before, I know the process",
]

export default function OnboardingQuestionsPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [onboarding_reason, setOnboarding_reason] = useState<string | null>(null)
  const [current_work, setCurrent_work] = useState('')
  const [work_style, setWork_style] = useState<string | null>(null)
  const [biggest_challenge, setBiggest_challenge] = useState<string | null>(null)
  const [coaching_style, setCoaching_style] = useState<string | null>(null)
  const [experience_level, setExperience_level] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canContinue =
    step === 1 ? onboarding_reason != null :
    step === 2 ? true :
    step === 3 ? work_style != null :
    step === 4 ? biggest_challenge != null :
    step === 5 ? coaching_style != null :
    experience_level != null

  const handleContinue = async () => {
    if (step < 6) {
      setStep((s) => s + 1)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/user/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboarding_reason: onboarding_reason ?? undefined,
          current_work: current_work.trim() || undefined,
          work_style: work_style ?? undefined,
          biggest_challenge: biggest_challenge ?? undefined,
          coaching_style: coaching_style ?? undefined,
          experience_level: experience_level ?? undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Something went wrong')
        setLoading(false)
        return
      }

      router.push('/onboarding/vision')
    } catch {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="font-display bg-[#FAF9F6] min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="aurora-bg" />

      <div className="relative z-10 w-full max-w-[520px] px-6 py-12">
        <div className="glass-card rounded-2xl p-8 md:p-12 transition-all duration-300">
          {/* Avatar 80x80 */}
          <div className="flex justify-center mb-6">
            <div
              className="relative size-20 rounded-full overflow-hidden shadow-lg"
              style={{ boxShadow: '0 4px 14px 0 rgba(0,0,0,0.08)' }}
            >
              <Image
                src="/harvey/penguin-hat.png"
                alt=""
                width={80}
                height={80}
                className="object-cover"
              />
            </div>
          </div>

          {/* Progress dots: 6 dots, current = purple, rest = grey */}
          <div className="flex justify-center gap-2 mb-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-2 w-2 rounded-full transition-colors"
                style={{
                  backgroundColor: i <= step ? PURPLE : '#e2e8f0',
                }}
              />
            ))}
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="q1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                <h1 className="text-[#0d101b] tracking-tight text-2xl font-bold leading-tight text-center">
                  What brings you to Harvey?
                </h1>
                <div className="flex flex-wrap gap-2 justify-center">
                  {Q1_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setOnboarding_reason(opt)}
                      className="px-4 py-2.5 rounded-full text-sm font-medium transition-all border-2"
                      style={{
                        borderColor: onboarding_reason === opt ? PURPLE : '#e2e8f0',
                        backgroundColor: onboarding_reason === opt ? `${PURPLE}14` : 'transparent',
                        color: onboarding_reason === opt ? PURPLE : '#475569',
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="q2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                <h1 className="text-[#0d101b] tracking-tight text-2xl font-bold leading-tight text-center">
                  What are you working on right now?
                </h1>
                <input
                  type="text"
                  value={current_work}
                  onChange={(e) => setCurrent_work(e.target.value)}
                  placeholder="A SaaS app, a portfolio, learning React..."
                  disabled={loading}
                  className="w-full h-12 px-4 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#425ff0] focus:border-transparent transition-all disabled:opacity-50"
                />
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="q3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                <h1 className="text-[#0d101b] tracking-tight text-2xl font-bold leading-tight text-center">
                  How do you usually work?
                </h1>
                <div className="flex flex-wrap gap-2 justify-center">
                  {Q3_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setWork_style(opt)}
                      className="px-4 py-2.5 rounded-full text-sm font-medium transition-all border-2"
                      style={{
                        borderColor: work_style === opt ? PURPLE : '#e2e8f0',
                        backgroundColor: work_style === opt ? `${PURPLE}14` : 'transparent',
                        color: work_style === opt ? PURPLE : '#475569',
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="q4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                <h1 className="text-[#0d101b] tracking-tight text-2xl font-bold leading-tight text-center">
                  What&apos;s your biggest challenge right now?
                </h1>
                <div className="flex flex-wrap gap-2 justify-center">
                  {Q4_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setBiggest_challenge(opt)}
                      className="px-4 py-2.5 rounded-full text-sm font-medium transition-all border-2"
                      style={{
                        borderColor: biggest_challenge === opt ? PURPLE : '#e2e8f0',
                        backgroundColor: biggest_challenge === opt ? `${PURPLE}14` : 'transparent',
                        color: biggest_challenge === opt ? PURPLE : '#475569',
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 5 && (
              <motion.div
                key="q5"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                <h1 className="text-[#0d101b] tracking-tight text-2xl font-bold leading-tight text-center">
                  How do you want Harvey to coach you?
                </h1>
                <div className="flex flex-wrap gap-2 justify-center">
                  {Q5_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setCoaching_style(opt)}
                      className="px-4 py-2.5 rounded-full text-sm font-medium transition-all border-2"
                      style={{
                        borderColor: coaching_style === opt ? PURPLE : '#e2e8f0',
                        backgroundColor: coaching_style === opt ? `${PURPLE}14` : 'transparent',
                        color: coaching_style === opt ? PURPLE : '#475569',
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 6 && (
              <motion.div
                key="q6"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                <h1 className="text-[#0d101b] tracking-tight text-2xl font-bold leading-tight text-center">
                  Have you shipped something before?
                </h1>
                <div className="flex flex-wrap gap-2 justify-center">
                  {Q6_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setExperience_level(opt)}
                      className="px-4 py-2.5 rounded-full text-sm font-medium transition-all border-2"
                      style={{
                        borderColor: experience_level === opt ? PURPLE : '#e2e8f0',
                        backgroundColor: experience_level === opt ? `${PURPLE}14` : 'transparent',
                        color: experience_level === opt ? PURPLE : '#475569',
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-8">
            <button
              type="button"
              onClick={handleContinue}
              disabled={!canContinue || loading}
              className="w-full h-12 px-5 rounded-lg transition-all duration-200 font-bold text-base shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-white"
              style={{
                backgroundColor: PURPLE,
                boxShadow: `0 10px 15px -3px ${PURPLE}33`,
              }}
            >
              {loading ? 'Saving…' : 'Continue →'}
            </button>
          </div>
        </div>
      </div>

      <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-20 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-[#425ff0]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>
    </div>
  )
}
