/**
 * Onboarding Welcome Page
 *
 * Shown immediately after authentication for new users who don't have a name set.
 * Collects first name, then redirects to the main onboarding chat at /onboarding.
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function OnboardingWelcomePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/user/name', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Something went wrong')
        setLoading(false)
        return
      }

      router.push('/onboarding/questions')
    } catch (err) {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="font-display bg-[#FAF9F6] min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Aurora Background Effect - same as signin */}
      <div className="aurora-bg" />

      {/* Main Content Container - same width and layout as signin */}
      <div className="relative z-10 w-full max-w-[520px] px-6 py-12">
        <div className="glass-card rounded-2xl p-8 md:p-12 transition-all duration-300">
          {/* Centered avatar - 160x160 (2× original 80px) with subtle drop shadow */}
          <div className="flex justify-center mb-6">
            <div
              className="relative size-40 rounded-full overflow-hidden shadow-lg"
              style={{ boxShadow: '0 4px 14px 0 rgba(0,0,0,0.08)' }}
            >
              <Image
                src="/penguin_onboarding_screen_name.png"
                alt=""
                width={160}
                height={160}
                className="object-cover"
              />
            </div>
          </div>

          <h1 className="text-[#0d101b] tracking-tight text-3xl font-bold leading-tight text-center mb-6">
            What should Harvey call you?
          </h1>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your first name"
              disabled={loading}
              autoFocus
              className="w-full h-12 px-4 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#425ff0] focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full h-12 px-5 bg-[#425ff0] hover:bg-[#425ff0]/90 text-white rounded-lg transition-all duration-200 font-bold text-base shadow-lg shadow-[#425ff0]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? 'Saving…' : "Let's go →"}
            </button>
          </form>
        </div>
      </div>

      {/* Decorative Background Gradient Blobs - same as signin */}
      <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-20 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-[#425ff0]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>
    </div>
  )
}
