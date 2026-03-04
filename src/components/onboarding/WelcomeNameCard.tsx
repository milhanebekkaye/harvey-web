/**
 * WelcomeNameCard
 *
 * Card content for the onboarding welcome page only: penguin avatar,
 * "What should Harvey call you?", and first-name form. Submits via
 * PATCH /api/user/name then redirects. Logo/avatar size is independent
 * of the signin page (SigninCard uses the small Harvey sparkle icon).
 *
 * Used inside AuthPageLayout on /onboarding/welcome.
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export function WelcomeNameCard() {
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

      router.push('/onboarding/intro')
    } catch (err) {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  return (
    <>
      {/* Penguin avatar — 160×160 (2× original); change size-40 / width/height here to resize */}
      <div className="flex justify-center mb-6">
        <div
          className="relative size-40 rounded-full overflow-hidden shadow-lg"
          style={{ boxShadow: '0 4px 14px 0 rgba(0,0,0,0.08)' }}
        >
          <Image
            src="/harvey/penguin-scarf.png"
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
    </>
  )
}
