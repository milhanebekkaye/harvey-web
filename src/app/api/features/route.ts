/**
 * GET /api/features
 *
 * List all features with vote counts and whether the current user has voted.
 * Auth required.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'

type FeatureWithVotes = {
  id: string
  title: string
  description: string
  createdAt: Date
  votes: { userId: string }[]
}

type FeatureListItem = {
  id: string
  title: string
  description: string
  createdAt: Date
  voteCount: number
  hasVoted: boolean
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const features = await (prisma as unknown as { feature: { findMany: (args: unknown) => Promise<FeatureWithVotes[]> } }).feature.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        votes: { select: { userId: true } },
      },
    })

    const userId = user.id
    const result: FeatureListItem[] = features.map((f: FeatureWithVotes) => {
      const voteCount = f.votes.length
      const hasVoted = f.votes.some((v: { userId: string }) => v.userId === userId)
      return {
        id: f.id,
        title: f.title,
        description: f.description,
        createdAt: f.createdAt,
        voteCount,
        hasVoted,
      }
    })

    result.sort((a: FeatureListItem, b: FeatureListItem) => b.voteCount - a.voteCount)

    return NextResponse.json({ features: result }, { status: 200 })
  } catch (error) {
    console.error('[FeaturesAPI] GET error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
