'use client'

import { ArrowUp, Map } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface RoadmapFeature {
  id: string
  title: string
  description: string
  createdAt: string
  voteCount: number
  hasVoted: boolean
}

export default function RoadmapPage() {
  const router = useRouter()
  const [features, setFeatures] = useState<RoadmapFeature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFeatures = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/features')
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/signin')
          return
        }
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Failed to load features (${res.status})`)
      }
      const data = await res.json()
      setFeatures(data.features ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load roadmap')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchFeatures()
  }, [fetchFeatures])

  const handleVoteToggle = async (featureId: string) => {
    const feature = features.find((f) => f.id === featureId)
    if (!feature) return

    const hadVoted = feature.hasVoted
    setFeatures((prev) =>
      prev.map((f) =>
        f.id === featureId
          ? {
              ...f,
              hasVoted: !f.hasVoted,
              voteCount: f.voteCount + (hadVoted ? -1 : 1),
            }
          : f
      )
    )

    try {
      const res = await fetch(`/api/features/${featureId}/vote`, { method: 'POST' })
      if (!res.ok) {
        setFeatures((prev) =>
          prev.map((f) =>
            f.id === featureId
              ? { ...f, hasVoted: hadVoted, voteCount: feature.voteCount }
              : f
          )
        )
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to update vote')
      }
    } catch {
      setFeatures((prev) =>
        prev.map((f) =>
          f.id === featureId
            ? { ...f, hasVoted: hadVoted, voteCount: feature.voteCount }
            : f
        )
      )
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-10 pb-24">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/dashboard"
              className="text-sm text-[#62499c] hover:text-[#895af6] font-medium"
            >
              ← Back to dashboard
            </Link>
            <h1 className="text-2xl font-bold text-slate-800 mt-2">Feature Roadmap</h1>
            <p className="text-slate-500 text-sm mt-1">
              Vote for the features you want to see next.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="w-8 h-8 border-2 border-[#8B5CF6]/30 border-t-[#8B5CF6] rounded-full animate-spin" />
          </div>
        ) : features.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center">
            <Map className="w-12 h-12 text-slate-300 mb-4" />
            <p className="text-slate-600 font-medium">No features on the roadmap yet.</p>
            <p className="text-slate-500 text-sm mt-1">Stay tuned!</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {features.map((f) => (
              <li
                key={f.id}
                className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 flex items-start justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-slate-800 text-lg">{f.title}</h2>
                  <p className="text-slate-500 text-sm mt-1">{f.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleVoteToggle(f.id)}
                  className={`flex-shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    f.hasVoted
                      ? 'bg-[#8B5CF6] text-white'
                      : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <ArrowUp className="w-5 h-5" />
                  <span>{f.voteCount}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
